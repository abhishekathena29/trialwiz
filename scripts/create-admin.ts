/**
 * Creates (or signs in to) an email/password Firebase Auth user and adds it to the Firestore
 * `admins` allowlist that gates /admin, plus its `users/{uid}` profile (role 'admin').
 *
 *   npm run create-admin -- you@example.com
 *
 * Prompts for the password. Writing `admins/{uid}` from the client only works while the deployed
 * rules allow it, so run this BEFORE `firebase deploy --only firestore:rules` (which sets
 * `admins` to write: false). After that, add admins in the Firebase console instead.
 */
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';

const email = process.argv[2];
if (!email) {
  console.error('Usage: npm run create-admin -- <email>');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .map((l) => l.split('='))
    .filter(([k, v]) => k && v),
);
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app);

const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = await rl.question('Password (min 6 chars): ');
rl.close();

let cred;
try {
  cred = await createUserWithEmailAndPassword(auth, email, password);
  console.log('Created auth user.');
} catch (e) {
  if ((e as { code?: string }).code !== 'auth/email-already-in-use') throw e;
  cred = await signInWithEmailAndPassword(auth, email, password);
  console.log('Auth user already existed — signed in.');
}

const db = getFirestore(app);
await setDoc(doc(db, 'admins', cred.user.uid), { email, createdAt: serverTimestamp() });
// Same profile shape recordSignIn() writes, so every account type is listed in users/.
await setDoc(
  doc(db, 'users', cred.user.uid),
  { uid: cred.user.uid, email, name: email.split('@')[0], role: 'admin', signInProvider: 'password', createdAt: serverTimestamp() },
  { merge: true },
);
console.log(`Added admins/${cred.user.uid} and users/${cred.user.uid}. Sign in at /admin with ${email}.`);
process.exit(0);
