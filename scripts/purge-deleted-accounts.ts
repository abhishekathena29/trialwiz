/**
 * Erases the Firebase Auth logins of accounts an admin deleted from the dashboard.
 *
 * "Delete account" in /admin removes everything in Firestore and writes a `deletedAccounts/{uid}`
 * tombstone, but a browser can't delete another user's Auth login — that needs the Admin SDK. Run
 * this now and then to finish the job (it frees the email for a fresh sign-up, too):
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=key.json npm run purge-deleted-accounts            # preview
 *   GOOGLE_APPLICATION_CREDENTIALS=key.json npm run purge-deleted-accounts -- --apply
 *
 * Skips any uid that has a `users/` profile again (deleted by mistake and restored). Tombstones are
 * kept, marked `authDeleted: true`, as the record of the deletion.
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const apply = process.argv.includes('--apply');
initializeApp({ credential: applicationDefault(), projectId: 'thetrialwiz' });
const db = getFirestore();
const auth = getAuth();

const pending = (await db.collection('deletedAccounts').where('authDeleted', '==', false).get()).docs;
console.log(`${pending.length} deleted account(s) whose login still exists.`);
for (const d of pending) {
  const t = d.data();
  if ((await db.doc(`users/${d.id}`).get()).exists) {
    console.log(`  skip  ${t.email} — has a profile again`);
    continue;
  }
  if (!apply) {
    console.log(`  would erase login: ${t.email} (${t.name})`);
    continue;
  }
  try {
    await auth.deleteUser(d.id);
  } catch (e) {
    if ((e as { code?: string }).code !== 'auth/user-not-found') {
      console.log(`  FAILED ${t.email}: ${e instanceof Error ? e.message : e}`);
      continue;
    }
  }
  await d.ref.update({ authDeleted: true, authDeletedAt: FieldValue.serverTimestamp() });
  console.log(`  erased ${t.email}`);
}
if (!apply && pending.length) console.log('\nPreview only — re-run with --apply to erase these logins.');
