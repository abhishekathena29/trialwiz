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
import { accountLabel, type PiTitle, type PublicUserType, type UserContact, type UserProfile } from '../types';
import { writeAudit, type AuditActor } from './audit';
import { recordAdminCreatedPi } from './piAuthorization';
import { recordAdminCreatedTeamMember } from './teamApprovals';

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
  specialization?: string,
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
        ...(specialization?.trim() ? { specialization: specialization.trim() } : {}),
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
  specialization = '',
  piTitle: PiTitle = 'pi',
): Promise<void> {
  const firestore = requireDb();
  await saveUserPhones(uid, phones);
  await setDoc(doc(firestore, USERS_COLLECTION, uid), {
    uid,
    email,
    name,
    role: 'doctor',
    piTitle,
    specialization: specialization.trim(),
    facility: facility.trim(),
    city: city.trim(),
    state: state.trim(),
    status: 'pending',
    signInProvider: 'password',
    createdAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  });
}

/** Admin-only: every account profile (all roles) — the admin dashboard derives its doctor,
 * coordinator and new-account views from this one live list. */
export function subscribeAllUsers(onChange: (users: UserProfile[]) => void): () => void {
  if (!db) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    collection(db, USERS_COLLECTION),
    (snap) => onChange(snap.docs.map((d) => d.data() as UserProfile)),
    (err) => {
      console.warn('[TrialWiz] all-users subscription failed:', err);
      onChange([]);
    },
  );
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
 * are public Trial Finder accounts (role 'user'); PIs and trial team doctors are role 'doctor'
 * (same features, different label); coordinators work under a PI. */
export type NewAccountRole = 'individual' | 'doctor' | 'pi' | 'coordinator' | 'trialDoctor';

export interface AdminCreateAccountParams {
  role: NewAccountRole;
  name: string;
  email: string;
  password: string;
  facility?: string;
  city?: string;
  state?: string;
  phones?: AccountPhones;
  /** PIs and doctors only. */
  specialization?: string;
  /** Coordinators only: the approved PI they'll work under. */
  supervisor?: UserProfile;
  /** The admin creating the account — recorded as the authorizer of a new PI. */
  admin?: AuditActor;
}

/**
 * Admin-only: creates a Firebase Auth user plus its profile, already approved. Uses a throwaway
 * secondary Firebase app so the admin's own session isn't replaced by the new account's.
 */
export async function createAccountByAdmin(params: AdminCreateAccountParams): Promise<string> {
  const firestore = requireDb();
  const isTeam = params.role === 'coordinator';
  const isPi = params.role === 'pi' || params.role === 'trialDoctor';
  if (isTeam && !params.supervisor) {
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
    const specialization = (params.specialization ?? '').trim();

    let profile: Record<string, unknown>;
    if (isPi) {
      profile = {
        ...base,
        role: 'doctor',
        piTitle: params.role === 'trialDoctor' ? 'trialDoctor' : 'pi',
        specialization,
        facility: (params.facility ?? '').trim(),
        city: (params.city ?? '').trim(),
        state: (params.state ?? '').trim(),
        status: 'approved',
        // Admin-created PIs are authorized by the admin at creation time.
        authorizedByUid: params.admin?.uid ?? '',
        authorizedByName: params.admin?.name ?? 'TrialWiz admin',
        authorizedByRole: 'admin',
        authorizedAt: serverTimestamp(),
      };
    } else if (isTeam) {
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
      profile = {
        ...base,
        role: 'user',
        userType: params.role,
        ...(params.role === 'doctor' && specialization ? { specialization } : {}),
      };
    }
    await setDoc(doc(firestore, USERS_COLLECTION, uid), profile);
    await saveUserPhones(uid, params.phones ?? {});
    if (isPi && params.admin) {
      await recordAdminCreatedPi(profile as unknown as UserProfile, { ...params.admin, name: params.admin.name ?? 'TrialWiz admin', role: 'admin' }).catch(
        (e) => console.warn('[TrialWiz] authorization history write failed (admin-created PI):', e),
      );
    }
    if (isTeam && params.admin && params.supervisor) {
      await recordAdminCreatedTeamMember(profile as unknown as UserProfile, params.supervisor, {
        uid: params.admin.uid,
        email: params.admin.email,
        name: params.admin.name ?? 'TrialWiz admin',
        role: 'admin',
      }).catch((e) => console.warn('[TrialWiz] team approval log write failed (admin-created member):', e));
    }

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

/** Coordinators who named this PI's email at sign-up, regardless of status — the PI's dashboard
 * splits them into pending/approved/rejected lists client-side. Live: updates the moment someone
 * names them, or an existing coordinator's status changes. */
export function subscribeTeamForPi(piEmail: string, onChange: (members: UserProfile[]) => void): () => void {
  if (!db) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    query(
      collection(db, USERS_COLLECTION),
      where('role', '==', 'coordinator'),
      where('requestedDoctorEmail', '==', piEmail.trim().toLowerCase()),
    ),
    (snap) => onChange(snap.docs.map((d) => d.data() as UserProfile)),
    (err) => {
      console.warn('[TrialWiz] coordinator subscription failed:', err);
      onChange([]);
    },
  );
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

/** Profile fields an admin (or the account owner, within firestore.rules limits) can edit. */
export interface AccountEdit {
  name?: string;
  /** Admin only, role 'doctor' accounts: PI vs Trial Team Doctor label. */
  piTitle?: PiTitle;
  facility?: string;
  city?: string;
  state?: string;
  specialization?: string;
}

function cleanEdit(edit: AccountEdit): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(edit)) {
    if (typeof v === 'string') out[k] = v.trim();
  }
  if (out.name === '') delete out.name;
  return out;
}

/** Saves both phone numbers as given (blank clears one). Unlike `saveUserPhones`, never a no-op. */
async function writePhones(uid: string, phones: AccountPhones): Promise<void> {
  const firestore = requireDb();
  await setDoc(doc(firestore, USER_CONTACTS_COLLECTION, uid), {
    uid,
    phone: (phones.phone ?? '').trim(),
    publicPhone: (phones.publicPhone ?? '').trim(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Admin-only: edits an account's details — name, hospital, city/state, specialization and phone
 * numbers. Recorded in the audit trail with a summary of what changed.
 */
export async function updateAccountByAdmin(
  admin: AuditActor,
  account: UserProfile,
  edit: AccountEdit,
  phones: AccountPhones,
  previousPhones: AccountPhones,
): Promise<void> {
  const firestore = requireDb();
  const patch = cleanEdit(edit);
  const changed = Object.entries(patch)
    .filter(([k, v]) => ((account as unknown as Record<string, unknown>)[k] ?? '') !== v)
    .map(([k, v]) => `${k}: "${(account as unknown as Record<string, unknown>)[k] ?? ''}" → "${v}"`);
  if (Object.keys(patch).length) await updateDoc(doc(firestore, USERS_COLLECTION, account.uid), patch);
  const phoneChanged =
    (phones.phone ?? '').trim() !== (previousPhones.phone ?? '').trim() ||
    (phones.publicPhone ?? '').trim() !== (previousPhones.publicPhone ?? '').trim();
  if (phoneChanged) {
    await writePhones(account.uid, phones);
    changed.push('phone numbers');
  }
  if (changed.length === 0) return;
  await writeAudit(
    admin,
    'account_edited',
    `${account.name} <${account.email}>`,
    `${accountLabel(account)} · ${changed.join('; ')}`,
  ).catch((e) => console.warn('[TrialWiz] audit write failed (account edit):', e));
}

/** The signed-in user edits their own details. firestore.rules keep a verified PI's hospital
 * fixed (it decides which PIs they may authorize) — only an admin can change it. */
export async function updateOwnAccount(account: UserProfile, edit: AccountEdit, phones: AccountPhones): Promise<void> {
  const firestore = requireDb();
  const patch = cleanEdit(edit);
  if (account.role === 'doctor' && account.status === 'approved') delete patch.facility;
  delete patch.piTitle; // the PI / Trial Team Doctor label is set by admin
  if (Object.keys(patch).length) await updateDoc(doc(firestore, USERS_COLLECTION, account.uid), patch);
  await writePhones(account.uid, phones);
}
