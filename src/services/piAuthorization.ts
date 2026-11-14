import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { PiAuthorization, UserProfile } from '../types';
import { writeAudit } from './audit';

export const PI_AUTHORIZATIONS_COLLECTION = 'piAuthorizations';
// Same value as profiles.USERS_COLLECTION — not imported, to keep this module free of a cycle.
const USERS = 'users';

function requireDb() {
  if (!db) throw new Error('Firebase is not configured — see README.md.');
  return db;
}

/** Normalised hospital name used for every same-hospital check. firestore.rules applies the
 * identical `.trim().lower()`, so the UI and the backend agree on what "same hospital" means. */
export function hospitalKey(facility?: string): string {
  return (facility ?? '').trim().toLowerCase();
}

export interface Authorizer {
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'pi';
  /** PIs only: the authorizer's own hospital. */
  facility?: string;
}

/** Can this verified PI authorize that pending PI? Mirrors the firestore.rules check. */
export function canPiAuthorize(authorizer: UserProfile, target: UserProfile): boolean {
  const mine = hospitalKey(authorizer.facility);
  return (
    authorizer.role === 'doctor' &&
    authorizer.status === 'approved' &&
    target.role === 'doctor' &&
    target.status === 'pending' &&
    target.uid !== authorizer.uid &&
    mine.length > 0 &&
    hospitalKey(target.facility) === mine
  );
}

function historyRecord(id: string, pi: UserProfile, by: Authorizer): Record<string, unknown> {
  return {
    id,
    piUid: pi.uid,
    piName: pi.name,
    piEmail: pi.email,
    hospital: (pi.facility ?? '').trim(),
    hospitalKey: hospitalKey(pi.facility),
    authorizedByUid: by.uid,
    authorizedByName: by.name,
    authorizedByEmail: by.email,
    authorizedByRole: by.role,
    authorizedAt: serverTimestamp(),
  };
}

/**
 * Verifies a pending Principal Investigator — by TrialWiz admin (any hospital) or by an
 * already-verified PI (their own hospital only; enforced in firestore.rules, not just here).
 * The status change and the history record are one atomic batch, so a PI is never approved
 * without a matching entry in the authorization history.
 */
export async function authorizePi(pi: UserProfile, by: Authorizer): Promise<void> {
  const firestore = requireDb();
  if (by.role === 'pi' && hospitalKey(by.facility) !== hospitalKey(pi.facility)) {
    throw new Error('You can only authorize Principal Investigators at your own hospital.');
  }
  const historyRef = doc(collection(firestore, PI_AUTHORIZATIONS_COLLECTION));
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, USERS, pi.uid), {
    status: 'approved',
    authorizedByUid: by.uid,
    authorizedByName: by.name,
    authorizedByRole: by.role,
    authorizedAt: serverTimestamp(),
  });
  batch.set(historyRef, historyRecord(historyRef.id, pi, by));
  await batch.commit();
  await writeAudit(
    { uid: by.uid, email: by.email, name: by.name },
    'pi_authorized',
    `${pi.name} <${pi.email}>`,
    `${by.role === 'admin' ? 'Admin' : 'Principal Investigator'} authorization · ${pi.facility || 'no hospital'}`,
  ).catch((e) => console.warn('[TrialWiz] audit write failed (PI authorized):', e));
}

/** History entry for a PI an admin created already-approved (no status flip needed). */
export async function recordAdminCreatedPi(pi: UserProfile, admin: Authorizer): Promise<void> {
  const firestore = requireDb();
  const ref = doc(collection(firestore, PI_AUTHORIZATIONS_COLLECTION));
  await setDoc(ref, historyRecord(ref.id, pi, admin));
}

function subscribe(
  q: ReturnType<typeof query>,
  onChange: (rows: PiAuthorization[]) => void,
): () => void {
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => d.data() as PiAuthorization)),
    (err) => {
      console.warn('[TrialWiz] PI authorization history subscription failed:', err);
      onChange([]);
    },
  );
}

/** Admin-only: the full authorization history, newest first. */
export function subscribeAllPiAuthorizations(onChange: (rows: PiAuthorization[]) => void): () => void {
  if (!db) {
    onChange([]);
    return () => {};
  }
  return subscribe(query(collection(db, PI_AUTHORIZATIONS_COLLECTION), orderBy('authorizedAt', 'desc')), onChange);
}

/** Verified PIs: the authorization history for their own hospital. Sorted client-side so it
 * needs no composite index. */
export function subscribeHospitalPiAuthorizations(
  facility: string,
  onChange: (rows: PiAuthorization[]) => void,
): () => void {
  const key = hospitalKey(facility);
  if (!db || !key) {
    onChange([]);
    return () => {};
  }
  return subscribe(query(collection(db, PI_AUTHORIZATIONS_COLLECTION), where('hospitalKey', '==', key)), onChange);
}

/** Every PI profile at one hospital (publicly readable doctor profiles, filtered client-side
 * with the same `hospitalKey` normalisation the rules use). */
export function subscribeHospitalPis(facility: string, onChange: (pis: UserProfile[]) => void): () => void {
  const key = hospitalKey(facility);
  if (!db || !key) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, USERS), where('role', '==', 'doctor')),
    (snap) =>
      onChange(snap.docs.map((d) => d.data() as UserProfile).filter((p) => hospitalKey(p.facility) === key)),
    (err) => {
      console.warn('[TrialWiz] hospital PI subscription failed:', err);
      onChange([]);
    },
  );
}
