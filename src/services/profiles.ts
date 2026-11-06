import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signOut, type User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, firebaseConfig } from '../firebase';
import type { PublicUserType, UserContact, UserProfile } from '../types';
import { writeAudit, type AuditActor } from './audit';

export const USERS_COLLECTION = 'users';
/** Phone numbers live outside `users/` because PI profiles are publicly readable (coordinators
 * look them up before signing in). `userContacts/{uid}` is readable by the owner and admins only. */
export const USER_CONTACTS_COLLECTION = 'userContacts';

function requireDb() {
  if (!db) throw new Error('Firebase is not configured — see README.md.');
  return db;
}

/**
 * Records a sign-in in `users/{uid}`: stamps `lastLoginAt` on an existing profile, or — when
 * `createAs` is given and there's no profile yet — creates a basic one. Portal sign-up writes its
 * own richer doctor/coordinator doc, so portal sign-in passes no `createAs`. Never throws: a
 * failed write is logged and must not block the sign-in itself.
 */
export async function recordSignIn(
  user: User,
  createAs?: 'user' | 'admin',
  userType?: PublicUserType,
  name?: string,
): Promise<void> {
  try {
    const firestore = requireDb();
    const ref = doc(firestore, USERS_COLLECTION, user.uid);
    if ((await getDoc(ref)).exists()) {
      await updateDoc(ref, { lastLoginAt: serverTimestamp() });
    } else if (createAs) {
      const email = user.email ?? '';
      await setDoc(ref, {
        uid: user.uid,
        email,
        name: name?.trim() || user.displayName || email.split('@')[0],
        role: createAs,
        ...(createAs === 'user' && userType ? { userType } : {}),
        signInProvider: user.providerData[0]?.providerId ?? 'password',
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.warn('[TrialWiz] failed to record sign-in in users/:', err);
  }
}

export interface AccountPhones {
  /** Private phone — owner + admin only. */
  phone?: string;
  /** PI / doctor public phone — default contact shown on their trials. */
  publicPhone?: string;
}

/** Stores a user's phone numbers (no-op when both are blank). */
export async function saveUserPhones(uid: string, phones: AccountPhones): Promise<void> {
  const phone = (phones.phone ?? '').trim();
  const publicPhone = (phones.publicPhone ?? '').trim();
  if (!phone && !publicPhone) return;
  const firestore = requireDb();
  await setDoc(doc(firestore, USER_CONTACTS_COLLECTION, uid), {
    uid,
    phone,
    publicPhone,
    updatedAt: serverTimestamp(),
  });
}

/** One user's contact doc — for the signed-in user's own phone. */
export function subscribeUserContact(uid: string, onChange: (contact: UserContact | null) => void): () => void {
  if (!db) {
    onChange(null);
    return () => {};
  }
  return onSnapshot(
    doc(db, USER_CONTACTS_COLLECTION, uid),
    (snap) => onChange(snap.exists() ? (snap.data() as UserContact) : null),
    () => onChange(null),
  );
}

/** Admin-only: every user's contact phone, keyed by uid. */
export function subscribeAllUserContacts(onChange: (byUid: Map<string, UserContact>) => void): () => void {
  if (!db) {
    onChange(new Map());
    return () => {};
  }
  return onSnapshot(
    collection(db, USER_CONTACTS_COLLECTION),
    (snap) => onChange(new Map(snap.docs.map((d) => [d.id, d.data() as UserContact]))),
    (err) => {
      console.warn('[TrialWiz] user contacts subscription failed:', err);
      onChange(new Map());
    },
  );
}

export async function createDoctorProfile(
  uid: string,
  email: string,
  name: string,
  facility: string,
  city = '',
  state = '',
  phones: AccountPhones = {},
): Promise<void> {
  const firestore = requireDb();
  await saveUserPhones(uid, phones);
  await setDoc(doc(firestore, USERS_COLLECTION, uid), {
    uid,
    email,
    name,
    role: 'doctor',
    facility: facility.trim(),
    city: city.trim(),
    state: state.trim(),
    status: 'pending',
    signInProvider: 'password',
    createdAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
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

/** Account types the admin (and the sign-up page) can create. Individuals and referring doctors
 * are public Trial Finder accounts (role 'user'); PIs are role 'doctor'. */
export type NewAccountRole = 'individual' | 'doctor' | 'pi' | 'coordinator';

export interface AdminCreateAccountParams {
  role: NewAccountRole;
  name: string;
  email: string;
  password: string;
  facility?: string;
  city?: string;
  state?: string;
  phones?: AccountPhones;
  /** Coordinators only: the approved PI they'll work under. */
  supervisor?: UserProfile;
}

/**
 * Admin-only: creates a Firebase Auth user plus its profile, already approved. Uses a throwaway
 * secondary Firebase app so the admin's own session isn't replaced by the new account's.
 */
export async function createAccountByAdmin(params: AdminCreateAccountParams): Promise<string> {
  const firestore = requireDb();
  if (params.role === 'coordinator' && !params.supervisor) {
    throw new Error('Choose the Principal Investigator this coordinator works under.');
  }
  const appName = `admin_create_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const secondaryApp = initializeApp(firebaseConfig, appName);
  try {
    const secondaryAuth = getAuth(secondaryApp);
    const email = params.email.trim();
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, params.password);
    await signOut(secondaryAuth);
    const uid = cred.user.uid;
    const base = { uid, email, name: params.name.trim(), signInProvider: 'password', createdAt: serverTimestamp() };

    let profile: Record<string, unknown>;
    if (params.role === 'pi') {
      profile = {
        ...base,
        role: 'doctor',
        facility: (params.facility ?? '').trim(),
        city: (params.city ?? '').trim(),
        state: (params.state ?? '').trim(),
        status: 'approved',
      };
    } else if (params.role === 'coordinator') {
      const sup = params.supervisor!;
      profile = {
        ...base,
        role: 'coordinator',
        status: 'approved',
        requestedDoctorEmail: sup.email.trim().toLowerCase(),
        requestedDoctorName: sup.name,
        doctorUid: sup.uid,
        facility: (params.facility ?? '').trim() || sup.facility || '',
        city: (params.city ?? '').trim() || sup.city || '',
        state: (params.state ?? '').trim() || sup.state || '',
      };
    } else {
      profile = { ...base, role: 'user', userType: params.role };
    }
    await setDoc(doc(firestore, USERS_COLLECTION, uid), profile);
    await saveUserPhones(uid, params.phones ?? {});

    return uid;
  } finally {
    await deleteApp(secondaryApp).catch(() => {});
  }
}

export async function findDoctorByEmail(email: string): Promise<UserProfile | null> {
  const firestore = requireDb();
  const clean = email.trim().toLowerCase();
  if (!clean) return null;
  const q = query(
    collection(firestore, USERS_COLLECTION),
    where('role', '==', 'doctor'),
    where('email', '==', clean),
  );
  const snap = await getDocs(q);
  if (!snap.empty) {
    return snap.docs[0].data() as UserProfile;
  }
  // Fallback scan in case email was saved with different casing
  const allQ = query(collection(firestore, USERS_COLLECTION), where('role', '==', 'doctor'));
  const allSnap = await getDocs(allQ);
  const docMatch = allSnap.docs.find((d) => (d.data() as UserProfile).email?.toLowerCase() === clean);
  return docMatch ? (docMatch.data() as UserProfile) : null;
}

export async function createCoordinatorProfile(
  uid: string,
  email: string,
  name: string,
  requestedDoctorEmail: string,
  facility: string,
  city: string,
  state: string,
  requestedDoctorName?: string,
  phones: AccountPhones = {},
): Promise<void> {
  const firestore = requireDb();
  await saveUserPhones(uid, phones);
  await setDoc(doc(firestore, USERS_COLLECTION, uid), {
    uid,
    email,
    name,
    role: 'coordinator',
    status: 'pending',
    requestedDoctorEmail: requestedDoctorEmail.trim().toLowerCase(),
    requestedDoctorName: requestedDoctorName || '',
    doctorUid: null,
    facility,
    city,
    state,
    signInProvider: 'password',
    createdAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
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

/** Admin-only: every trial coordinator account, any status. */
export function subscribeCoordinators(onChange: (coordinators: UserProfile[]) => void): () => void {
  if (!db) {
    onChange([]);
    return () => {};
  }
  const q = query(collection(db, USERS_COLLECTION), where('role', '==', 'coordinator'));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => d.data() as UserProfile)),
    (err) => {
      console.warn('[TrialWiz] coordinator list subscription failed:', err);
      onChange([]);
    },
  );
}

/**
 * Admin-only: turns a Principal Investigator into a trial coordinator working under another PI.
 * The account is linked to (and approved for) the chosen supervising PI straight away, since the
 * admin is making the call. Their existing claims stay in place. Recorded in the audit trail.
 */
export async function changePiToCoordinator(
  admin: AuditActor,
  pi: UserProfile,
  supervisor: UserProfile,
): Promise<void> {
  const firestore = requireDb();
  await updateDoc(doc(firestore, USERS_COLLECTION, pi.uid), {
    role: 'coordinator',
    status: 'approved',
    requestedDoctorEmail: supervisor.email.trim().toLowerCase(),
    requestedDoctorName: supervisor.name,
    doctorUid: supervisor.uid,
    facility: pi.facility || supervisor.facility || '',
    city: pi.city || supervisor.city || '',
    state: pi.state || supervisor.state || '',
  });
  await writeAudit(
    admin,
    'role_changed',
    `${pi.name} <${pi.email}>`,
    `Principal Investigator → Trial Coordinator (under ${supervisor.name} <${supervisor.email}>)`,
  ).catch((e) => console.warn('[TrialWiz] audit write failed (role change):', e));
}

/** Admin-only: promotes a trial coordinator to an approved Principal Investigator. */
export async function changeCoordinatorToPi(admin: AuditActor, coordinator: UserProfile): Promise<void> {
  const firestore = requireDb();
  await updateDoc(doc(firestore, USERS_COLLECTION, coordinator.uid), {
    role: 'doctor',
    status: 'approved',
    requestedDoctorEmail: '',
    requestedDoctorName: '',
    doctorUid: null,
  });
  await writeAudit(
    admin,
    'role_changed',
    `${coordinator.name} <${coordinator.email}>`,
    'Trial Coordinator → Principal Investigator',
  ).catch((e) => console.warn('[TrialWiz] audit write failed (role change):', e));
}
