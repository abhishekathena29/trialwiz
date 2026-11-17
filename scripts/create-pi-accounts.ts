/**
 * Creates an approved Principal Investigator account for every doctor named as PI on a CTRI trial
 * shown on the site — one account per PI email in data/ctri-oncology-trials.csv (rows CTRI tags
 * "Peripheral (not an oncology question)" are skipped, same as the public app hides them).
 *
 *   npm run create-pi-accounts                     # dry run: plan + preview CSV, touches nothing
 *   GOOGLE_APPLICATION_CREDENTIALS=key.json npm run create-pi-accounts -- --apply
 *   … -- --apply --include-sponsors                # also sponsor / CRO contacts (see below)
 *
 * Sponsor-run trials list the pharma company's or CRO's medical contact in CTRI's PI field
 * (e.g. "AstraZeneca Pharma India Ltd", "IQVIA RDS"). They aren't hospital investigators, and an
 * approved PI account could claim and close hospital trials, so they're left out unless
 * --include-sponsors is passed. The preview CSV marks each row's type so you can check.
 *
 * For each PI email:
 *   - no Firebase Auth user yet  → creates one with a random password, plus an approved
 *     `users/{uid}` PI profile, `userContacts/{uid}` (public phone from CTRI), and a
 *     `piAuthorizations` history entry (authorized by admin, bulk import from CTRI);
 *   - Auth user exists, no profile / a pending or rejected PI profile → makes it an approved PI
 *     (existing password untouched);
 *   - already an approved PI → left alone;
 *   - any other kind of account (public user, coordinator, admin) → skipped and reported.
 * Re-running is safe: it never resets a password or overwrites an existing approved account.
 *
 * No emails are sent. New logins' passwords are written to private/pi-accounts-<timestamp>.csv
 * (gitignored) — share each doctor's password with them yourself, and keep that file private.
 *
 * Uses the Admin SDK (service-account key for `thetrialwiz`: Firebase console → Project settings →
 * Service accounts → Generate new private key), so it bypasses firestore.rules.
 */
import { randomInt } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { parseCsv } from './ctri';

const PROJECT_ID = 'thetrialwiz';
const AUTHORIZER_NAME = 'TrialWiz admin (CTRI import)';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const includeSponsors = args.includes('--include-sponsors');
const csvPath = args.find((a) => a.endsWith('.csv')) ?? 'data/ctri-oncology-trials.csv';

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;

/** A company name (pharma, CRO, biotech)… */
const COMPANY_RE =
  /\b(ltd|limited|pvt|private|pharma|pharmaceuticals?|inc|llc|gmbh|laborator(y|ies)|labs|biotech\w*|biologics|biosciences?|life ?sciences?|therapeutics|clinical research|research services|cro|clinicals|organics|phytochem)\b/i;
/** …unless it's actually a hospital, college or university (HCG, Manipal, etc.). */
const CARE_OR_ACADEMIC_RE =
  /\b(hospitals?|medical college|college|university|universities|institute of medical|cancer cent(er|re)|healthcare global|hcg|aiims|nursing home|clinic)\b/i;

function isSponsorContact(institution: string): boolean {
  return COMPANY_RE.test(institution) && !CARE_OR_ACADEMIC_RE.test(institution);
}

interface Pi {
  email: string;
  name: string;
  facility: string;
  city: string;
  state: string;
  phone: string;
  trialIds: string[];
  /** The institution is a pharma company / CRO rather than a hospital. */
  sponsor: boolean;
  /** Data-quality notes worth a human look (several names / hospitals on one email). */
  notes: string[];
}

/** Most frequent non-empty value (first seen wins ties). */
function mode(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values.map((x) => x.trim()).filter(Boolean)) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = '';
  let n = 0;
  for (const [v, c] of counts) if (c > n) [best, n] = [v, c];
  return best;
}

function distinct(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

/** 14 chars from an unambiguous alphabet (no 0/O, 1/l/I). */
function randomPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from({ length: 14 }, () => alphabet[randomInt(alphabet.length)]).join('');
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildPis(rows: Record<string, string>[]): { pis: Pi[]; invalid: string[] } {
  const byEmail = new Map<string, Record<string, string>[]>();
  const invalid: string[] = [];
  for (const r of rows) {
    if (/peripheral/i.test(r['Category'] ?? '')) continue;
    const email = (r['PI email'] ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      if (email) invalid.push(`${r['CTRI number']}: "${email}"`);
      continue;
    }
    byEmail.set(email, [...(byEmail.get(email) ?? []), r]);
  }

  const pis: Pi[] = [];
  for (const [email, rs] of byEmail) {
    const names = rs.map((r) => r['PI'] || r['PI / scientific contact'] || '');
    const facility = mode(rs.map((r) => r['Institution'] || r['Primary sponsor'] || ''));
    // City/state from a row at the chosen institution.
    const home = rs.find((r) => (r['Institution'] || r['Primary sponsor'] || '').trim() === facility) ?? rs[0];
    const [rawCity = '', rawState = ''] = (home['City / state'] ?? '').split(/,\s*/);
    const notes: string[] = [];
    if (distinct(names).length > 1) notes.push(`several names: ${distinct(names).join(' / ')}`);
    const insts = distinct(rs.map((r) => r['Institution'] ?? ''));
    if (insts.length > 1) notes.push(`${insts.length} institutions — using "${facility}"`);
    pis.push({
      email,
      name: mode(names) || email.split('@')[0],
      facility,
      city: /^\d+$/.test(rawCity) ? '' : rawCity.trim(),
      state: rawState.trim(),
      phone: mode(rs.map((r) => r['PI phone'] ?? '')),
      trialIds: distinct(rs.map((r) => r['CTRI number'])),
      sponsor: isSponsorContact(facility),
      notes,
    });
  }
  pis.sort((a, b) => b.trialIds.length - a.trialIds.length || a.email.localeCompare(b.email));
  return { pis, invalid };
}

type Outcome = 'created' | 'approved-existing' | 'already-approved' | 'skipped-other-role' | 'failed';

async function main() {
  const { pis: all, invalid } = buildPis(parseCsv(readFileSync(csvPath, 'utf8')));
  const sponsors = all.filter((p) => p.sponsor);
  const pis = includeSponsors ? all : all.filter((p) => !p.sponsor);
  const flagged = pis.filter((p) => p.notes.length);
  console.log(`${all.length} distinct PI emails across ${all.reduce((n, p) => n + p.trialIds.length, 0)} CTRI oncology trials.`);
  console.log(
    `${sponsors.length} are sponsor / CRO contacts — ${includeSponsors ? 'INCLUDED (--include-sponsors)' : 'excluded (pass --include-sponsors to add them)'}.`,
  );
  console.log(`${pis.length} accounts to set up. ${invalid.length} rows had an unusable PI email; ${flagged.length} PIs flagged for review.`);

  mkdirSync('private', { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  if (!apply) {
    const preview = [
      'action,type,email,name,hospital,city,state,public_phone,trials,notes',
      ...all.map((p) =>
        [
          !p.sponsor || includeSponsors ? 'create' : 'skip',
          p.sponsor ? 'sponsor/CRO' : 'investigator',
          p.email,
          p.name,
          p.facility,
          p.city,
          p.state,
          p.phone,
          p.trialIds.join(' '),
          p.notes.join('; '),
        ]
          .map(csvCell)
          .join(','),
      ),
    ].join('\n');
    const out = `private/pi-accounts-preview-${stamp}.csv`;
    writeFileSync(out, preview);
    if (invalid.length) console.log('\nUnusable PI emails:\n  ' + invalid.join('\n  '));
    console.log(`\nDry run — nothing written to Firebase. Preview: ${out}`);
    console.log('Re-run with --apply (and GOOGLE_APPLICATION_CREDENTIALS) to create the accounts.');
    return;
  }

  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const auth = getAuth();
  const db = getFirestore();

  const credentials: string[] = ['email,name,hospital,password'];
  const report: string[] = ['email,name,hospital,outcome,detail'];
  const tally = new Map<Outcome, number>();
  const note = (p: Pi, o: Outcome, detail = '') => {
    tally.set(o, (tally.get(o) ?? 0) + 1);
    report.push([p.email, p.name, p.facility, o, detail].map(csvCell).join(','));
  };

  for (const [i, p] of pis.entries()) {
    try {
      let uid: string;
      let created = false;
      try {
        uid = (await auth.getUserByEmail(p.email)).uid;
      } catch (e) {
        if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
        const password = randomPassword();
        uid = (await auth.createUser({ email: p.email, password, displayName: p.name })).uid;
        created = true;
        credentials.push([p.email, p.name, p.facility, password].map(csvCell).join(','));
      }

      const ref = db.doc(`users/${uid}`);
      const snap = await ref.get();
      const existing = snap.data();
      if (existing && existing.role !== 'doctor') {
        note(p, 'skipped-other-role', `existing ${existing.role} account`);
        continue;
      }
      if (existing?.status === 'approved') {
        note(p, 'already-approved');
        continue;
      }

      const batch = db.batch();
      const authorization = {
        status: 'approved',
        authorizedByUid: 'ctri-import',
        authorizedByName: AUTHORIZER_NAME,
        authorizedByRole: 'admin',
        authorizedAt: FieldValue.serverTimestamp(),
        importedFrom: 'ctri',
      };
      if (existing) {
        // A self-registered PI waiting for verification: approve it, keep their own details.
        batch.update(ref, authorization);
      } else {
        batch.set(ref, {
          uid,
          email: p.email,
          name: p.name,
          role: 'doctor',
          piTitle: 'pi',
          specialization: '',
          facility: p.facility,
          city: p.city,
          state: p.state,
          signInProvider: 'password',
          createdAt: FieldValue.serverTimestamp(),
          ...authorization,
        });
        if (p.phone) {
          batch.set(
            db.doc(`userContacts/${uid}`),
            { uid, publicPhone: p.phone, updatedAt: FieldValue.serverTimestamp() },
            { merge: true },
          );
        }
      }
      const facility = (existing?.facility as string | undefined) ?? p.facility;
      const historyRef = db.collection('piAuthorizations').doc();
      batch.set(historyRef, {
        id: historyRef.id,
        piUid: uid,
        piName: (existing?.name as string | undefined) ?? p.name,
        piEmail: p.email,
        hospital: facility.trim(),
        hospitalKey: facility.trim().toLowerCase(),
        authorizedByUid: 'ctri-import',
        authorizedByName: AUTHORIZER_NAME,
        authorizedByEmail: '',
        authorizedByRole: 'admin',
        authorizedAt: FieldValue.serverTimestamp(),
      });
      await batch.commit();
      note(p, created ? 'created' : 'approved-existing', `${p.trialIds.length} trial(s)`);
    } catch (e) {
      note(p, 'failed', e instanceof Error ? e.message : String(e));
    }
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${pis.length}…`);
  }

  const auditRef = db.collection('auditLog').doc();
  await auditRef.set({
    id: auditRef.id,
    action: 'pi_authorized',
    actorUid: 'ctri-import',
    actorEmail: '',
    actorName: AUTHORIZER_NAME,
    target: `${tally.get('created') ?? 0} new + ${tally.get('approved-existing') ?? 0} existing PI accounts`,
    details: `Bulk import of CTRI trial PIs from ${csvPath}`,
    at: FieldValue.serverTimestamp(),
  });

  const credsPath = `private/pi-accounts-credentials-${stamp}.csv`;
  const reportPath = `private/pi-accounts-report-${stamp}.csv`;
  if (credentials.length > 1) writeFileSync(credsPath, credentials.join('\n'));
  writeFileSync(reportPath, report.join('\n'));
  console.log('\nDone:', Object.fromEntries(tally));
  if (credentials.length > 1) console.log(`Passwords for new logins: ${credsPath}  (private — do not commit or share)`);
  console.log(`Full report: ${reportPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
