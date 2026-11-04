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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
