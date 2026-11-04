/**
 * Syncs registry trials into Firestore `registryTrials`:
 *   - live recruiting India oncology studies from the ClinicalTrials.gov API, and
 *   - the CTRI oncology export at data/ctri-oncology-trials.csv.
 * One doc per study; studies no longer present in either source are deleted, so re-running
 * this is how the catalogue gets refreshed.
 *
 *   npm run seed:registry -- --dry-run        # build docs, write JSON preview, touch nothing
 *   GOOGLE_APPLICATION_CREDENTIALS=key.json npm run seed:registry
 *
 * The key is a service account for the `thetrialwiz` project (Firebase console → Project
 * settings → Service accounts → Generate new private key). Keep it out of the repo.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fetchIndiaCancerTrials } from '../src/api/clinicalTrials';
import type { RegistryTrialDoc } from '../src/types';
import { rowsToRegistryDocs, trialDocId } from '../src/utils/registryDocs';
import { ctriRowToDoc, parseCsv } from './ctri';

const PROJECT_ID = 'thetrialwiz';
const COLLECTION = 'registryTrials';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const csvPath = args.find((a) => a.endsWith('.csv')) ?? 'data/ctri-oncology-trials.csv';

async function main() {
  const syncedAt = new Date().toISOString();

  console.log('Fetching ClinicalTrials.gov…');
  const ctgovDocs = rowsToRegistryDocs(await fetchIndiaCancerTrials(), syncedAt);
  const ctgovById = new Map(ctgovDocs.map((d) => [d.nctId, d]));

  const ctriDocs: RegistryTrialDoc[] = [];
  let merged = 0;
  for (const row of parseCsv(readFileSync(csvPath, 'utf8'))) {
    const d = ctriRowToDoc(row, syncedAt);
    // Cross-registered and already in the live ClinicalTrials.gov set: keep the richer CT.gov
    // record (eligibility, all sites) and just note the CTRI number on it.
    const twin = d.ctri?.alsoOnCtgov && ctgovById.get(d.ctri.alsoOnCtgov);
    if (twin) {
      twin.ctriNumber = d.nctId;
      merged++;
    } else ctriDocs.push(d);
  }

  const all = [...ctgovDocs, ...ctriDocs];
  const ids = new Set(all.map((d) => trialDocId(d.nctId)));
  if (ids.size !== all.length) throw new Error('Duplicate trial ids after merge — aborting.');
  console.log(`ClinicalTrials.gov: ${ctgovDocs.length} studies · CTRI: ${ctriDocs.length} studies (${merged} merged into CT.gov twins)`);

  if (dryRun) {
    const out = 'data/registry-preview.json';
    writeFileSync(out, JSON.stringify(all, null, 2));
    console.log(`Dry run — wrote ${out}, Firestore untouched.`);
    return;
  }

  if (args.includes('--client')) return writeWithClientSdk(all, ids);

  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const db = getFirestore();
  const writer = db.bulkWriter();
  for (const d of all) void writer.set(db.collection(COLLECTION).doc(trialDocId(d.nctId)), d);

  const existing = await db.collection(COLLECTION).listDocuments();
  const stale = existing.filter((ref) => !ids.has(ref.id));
  for (const ref of stale) void writer.delete(ref);

  await writer.close();
  console.log(`Wrote ${all.length} docs to ${COLLECTION}, deleted ${stale.length} stale.`);
}

/** Writes with the public web config from `.env.local` instead of a service account. Only works
 * while the deployed Firestore rules allow unauthenticated writes to `registryTrials`. */
async function writeWithClientSdk(all: RegistryTrialDoc[], ids: Set<string>) {
  const { initializeApp: initWebApp } = await import('firebase/app');
  const { collection, doc, getDocs, getFirestore: getWebFirestore, writeBatch } = await import('firebase/firestore');
  const env = Object.fromEntries(
    readFileSync('.env.local', 'utf8')
      .split('\n')
      .map((l) => l.split('='))
      .filter(([k, v]) => k && v),
  );
  const db = getWebFirestore(
    initWebApp({ apiKey: env.VITE_FIREBASE_API_KEY, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID }),
  );

  const stale = (await getDocs(collection(db, COLLECTION))).docs.filter((d) => !ids.has(d.id));
  const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [
    ...all.map((d) => (b: ReturnType<typeof writeBatch>) => b.set(doc(db, COLLECTION, trialDocId(d.nctId)), d)),
    ...stale.map((s) => (b: ReturnType<typeof writeBatch>) => b.delete(s.ref)),
  ];
  // Batches cap at 500 writes and 10 MiB; 100 docs keeps well under the size cap.
  for (let i = 0; i < ops.length; i += 100) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + 100)) op(batch);
    await batch.commit();
  }
  console.log(`Wrote ${all.length} docs to ${COLLECTION} (client SDK), deleted ${stale.length} stale.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
