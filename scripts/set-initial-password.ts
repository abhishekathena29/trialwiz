/**
 * Sets one shared initial password on the PI accounts created by create-pi-accounts.ts, so admin
 * can hand out logins without a per-person password list — and flags each account
 * `mustChangePassword`, so the doctor has to pick their own password the first time they log in
 * (PortalApp blocks the dashboard until they do). The shared password therefore works only once
 * per account.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=key.json npm run set-initial-password                  # preview
 *   GOOGLE_APPLICATION_CREDENTIALS=key.json npm run set-initial-password -- --apply
 *   … -- --apply --password=SomethingElse    # a different shared password (min 6 characters)
 *   … -- --apply --include-signed-in         # also reset accounts that have already logged in
 *
 * Targets: the accounts listed in private/pi-accounts-credentials-*.csv (the ones that script
 * created). Accounts that have already signed in are skipped by default — the doctor may have
 * set their own password, and this would overwrite it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const includeSignedIn = args.includes('--include-signed-in');
const password = args.find((a) => a.startsWith('--password='))?.slice('--password='.length) ?? '123456';
if (password.length < 6) throw new Error('Firebase requires a password of at least 6 characters.');

const files = readdirSync('private').filter((f) => /^pi-accounts-credentials-.*\.csv$/.test(f));
if (!files.length) throw new Error('No private/pi-accounts-credentials-*.csv found — nothing to target.');
const emails = new Set<string>();
for (const f of files) {
  for (const line of readFileSync(`private/${f}`, 'utf8').split('\n').slice(1)) {
    const email = line.split(',')[0]?.trim().toLowerCase();
    if (email) emails.add(email);
  }
}

initializeApp({ credential: applicationDefault(), projectId: 'thetrialwiz' });
const auth = getAuth();
const db = getFirestore();

const tally = { reset: 0, skippedSignedIn: 0, notFound: 0, failed: 0 };
const skipped: string[] = [];
let i = 0;
for (const email of emails) {
  i++;
  try {
    const user = await auth.getUserByEmail(email);
    if (user.metadata.lastSignInTime && !includeSignedIn) {
      tally.skippedSignedIn++;
      skipped.push(`${email} (last sign-in ${user.metadata.lastSignInTime})`);
      continue;
    }
    if (apply) {
      await auth.updateUser(user.uid, { password });
      await db.doc(`users/${user.uid}`).set({ mustChangePassword: true }, { merge: true });
    }
    tally.reset++;
  } catch (e) {
    if ((e as { code?: string }).code === 'auth/user-not-found') tally.notFound++;
    else {
      tally.failed++;
      console.log(`  FAILED ${email}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (i % 100 === 0) console.log(`  ${i}/${emails.size}…`);
}

console.log(apply ? '\nDone:' : '\nPreview (nothing changed):', tally);
if (skipped.length) console.log('Already signed in — left alone (use --include-signed-in to reset them too):\n  ' + skipped.join('\n  '));
if (!apply) console.log(`\nRe-run with --apply to set the shared password on ${tally.reset} account(s).`);
