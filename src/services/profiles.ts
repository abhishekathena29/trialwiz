import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
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
import { db, firebaseConfig } from '../firebase';
import type { UserProfile } from '../types';

export const USERS_COLLECTION = 'users';

function requireDb() {
  if (!db) throw new Error('Firebase is not configured — see README.md.');
  return db;
}

export async function createDoctorProfile(
  uid: string,
  email: string,
  name: string,
  facility: string,
  city = '',
  state = '',
): Promise<void> {
  const firestore = requireDb();
  await setDoc(doc(firestore, USERS_COLLECTION, uid), {
    uid,
    email,
    name,
    role: 'doctor',
    facility: facility.trim(),
    city: city.trim(),
    state: state.trim(),
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}

export async function approveDoctor(doctorUid: string): Promise<void> {
  const firestore = requireDb();
  await updateDoc(doc(firestore, USERS_COLLECTION, doctorUid), {
    status: 'approved',
  });
}

export async function rejectDoctor(doctorUid: string): Promise<void> {
  const firestore = requireDb();
  await updateDoc(doc(firestore, USERS_COLLECTION, doctorUid), {
    status: 'rejected',
  });
}

export function subscribeDoctors(onChange: (doctors: UserProfile[]) => void): () => void {
  if (!db) {
    onChange([]);
    return () => {};
  }
  const q = query(collection(db, USERS_COLLECTION), where('role', '==', 'doctor'));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => d.data() as UserProfile)),
    (err) => {
      console.warn('[TrialWiz] doctor subscription failed:', err);
      onChange([]);
    },
  );
}

export interface AdminCreateDoctorParams {
  name: string;
  email: string;
  password: string;
  facility: string;
  city?: string;
  state?: string;
}

export async function createDoctorAccountByAdmin(params: AdminCreateDoctorParams): Promise<string> {
  const firestore = requireDb();
  const appName = `admin_create_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const secondaryApp = initializeApp(firebaseConfig, appName);
  try {
    const secondaryAuth = getAuth(secondaryApp);
    const cred = await createUserWithEmailAndPassword(secondaryAuth, params.email.trim(), params.password);
    await signOut(secondaryAuth);
    const uid = cred.user.uid;

    await setDoc(doc(firestore, USERS_COLLECTION, uid), {
      uid,
      email: params.email.trim(),
      name: params.name.trim(),
      role: 'doctor',
      facility: params.facility.trim(),
      city: (params.city ?? '').trim(),
      state: (params.state ?? '').trim(),
      status: 'approved',
      createdAt: serverTimestamp(),
    });

    return uid;
  } finally {
    await deleteApp(secondaryApp).catch(() => {});
  }
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
