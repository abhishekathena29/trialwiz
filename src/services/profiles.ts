import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { UserProfile } from '../types';

export const USERS_COLLECTION = 'users';

function requireDb() {
  if (!db) throw new Error('Firebase is not configured — see README.md.');
  return db;
}

export async function createDoctorProfile(uid: string, email: string, name: string): Promise<void> {
  const firestore = requireDb();
  await setDoc(doc(firestore, USERS_COLLECTION, uid), {
    uid,
    email,
    name,
    role: 'doctor',
    createdAt: serverTimestamp(),
  });
}

export async function createCoordinatorProfile(
  uid: string,
  email: string,
  name: string,
  requestedDoctorEmail: string,
  facility: string,
  city: string,
  state: string,
): Promise<void> {
  const firestore = requireDb();
  await setDoc(doc(firestore, USERS_COLLECTION, uid), {
    uid,
    email,
    name,
    role: 'coordinator',
    status: 'pending',
    requestedDoctorEmail: requestedDoctorEmail.trim().toLowerCase(),
    doctorUid: null,
    facility,
    city,
    state,
    createdAt: serverTimestamp(),
  });
}

/** Re-request approval from a (possibly different) doctor after a rejection. */
export async function requestDoctor(uid: string, requestedDoctorEmail: string): Promise<void> {
  const firestore = requireDb();
  await updateDoc(doc(firestore, USERS_COLLECTION, uid), {
    requestedDoctorEmail: requestedDoctorEmail.trim().toLowerCase(),
    doctorUid: null,
    status: 'pending',
  });
}

/** Coordinators who named this doctor's email at signup, regardless of status — the doctor's
 * dashboard splits them into pending/approved/rejected lists client-side. Live: updates the
 * moment a new coordinator names them, or an existing one's status changes. */
export function subscribeCoordinatorsForDoctor(doctorEmail: string, onChange: (coordinators: UserProfile[]) => void): () => void {
  if (!db) {
    onChange([]);
    return () => {};
  }
  const q = query(
    collection(db, USERS_COLLECTION),
    where('role', '==', 'coordinator'),
    where('requestedDoctorEmail', '==', doctorEmail.trim().toLowerCase()),
  );
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => d.data() as UserProfile)),
    (err) => {
      console.warn('[TrialWiz] coordinator subscription failed:', err);
      onChange([]);
    },
  );
}

export async function approveCoordinator(coordinatorUid: string, doctorUid: string): Promise<void> {
  const firestore = requireDb();
  await updateDoc(doc(firestore, USERS_COLLECTION, coordinatorUid), {
    status: 'approved',
    doctorUid,
  });
}

export async function rejectCoordinator(coordinatorUid: string): Promise<void> {
  const firestore = requireDb();
  await updateDoc(doc(firestore, USERS_COLLECTION, coordinatorUid), {
    status: 'rejected',
    doctorUid: null,
  });
}
