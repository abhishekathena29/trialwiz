import { deleteApp, initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, firebaseConfig } from '../firebase';
import { accountLabel, type MergeRequest, type UserContact, type UserProfile } from '../types';
import { DELETED_ACCOUNTS_COLLECTION, Writer } from './accountDeletion';
import { ADDED_SITES_COLLECTION } from './addedSites';
import type { AuditActor } from './audit';
import { CLAIM_PRIVATE_COLLECTION, CLAIMS_COLLECTION } from './trialClaims';
import { SUBMITTED_TRIALS_COLLECTION } from './trialSubmissions';

export const MERGE_REQUESTS_COLLECTION = 'mergeRequests';
const USERS = 'users';
const USER_CONTACTS = 'userContacts';

function requireDb() {
  if (!db) throw new Error('Firebase is not configured — see README.md.');
  return db;
}

const isProvider = (p: UserProfile) => p.role === 'doctor' || p.role === 'coordinator';

/** What moving `dup` into `keep` touches — shown to the admin before they confirm. */
export interface MergePreview {
  claims: number;
  submitted: number;
  addedSites: number;
  coordinators: number;
  /** Claims / trials / locations by *other* people that list `dup` as their team's PI. */
  teamItems: number;
}

async function ids(col: string, field: string, value: string) {
  const firestore = requireDb();
  return (await getDocs(query(collection(firestore, col), where(field, '==', value)))).docs;
}

async function gather(dup: UserProfile) {
  const email = dup.email.trim().toLowerCase();
  const [claims, teamClaims, submitted, teamSubmitted, piSubmitted, sites, teamSites, linked, named, privates] = await Promise.all([
    ids(CLAIMS_COLLECTION, 'claimedByUid', dup.uid),
    ids(CLAIMS_COLLECTION, 'teamPiUid', dup.uid),
    ids(SUBMITTED_TRIALS_COLLECTION, 'submittedBy', dup.uid),
    ids(SUBMITTED_TRIALS_COLLECTION, 'teamPiUid', dup.uid),
    ids(SUBMITTED_TRIALS_COLLECTION, 'doctorUid', dup.uid),
    ids(ADDED_SITES_COLLECTION, 'addedByUid', dup.uid),
    ids(ADDED_SITES_COLLECTION, 'teamPiUid', dup.uid),
    ids(USERS, 'doctorUid', dup.uid),
    dup.role === 'doctor' ? ids(USERS, 'requestedDoctorEmail', email) : Promise.resolve([]),
    ids(CLAIM_PRIVATE_COLLECTION, 'ownerUid', dup.uid),
  ]);
  const own = (docs: typeof claims) => new Set(docs.map((d) => d.id));
  const ownClaims = own(claims);
  const ownSubmitted = own(submitted);
  const ownSites = own(sites);
  const coordinators = new Map<string, UserProfile>();
  for (const d of [...linked, ...named]) {
    const p = d.data() as UserProfile;
    if (p.role === 'coordinator' && p.uid !== dup.uid) coordinators.set(p.uid, p);
  }
  return {
    claims,
    submitted,
    sites,
    privates,
    coordinators: [...coordinators.values()],
    teamClaims: teamClaims.filter((d) => !ownClaims.has(d.id)),
    teamSubmitted: [...teamSubmitted, ...piSubmitted].filter(
      (d, i, all) => !ownSubmitted.has(d.id) && all.findIndex((x) => x.id === d.id) === i,
    ),
    teamSites: teamSites.filter((d) => !ownSites.has(d.id)),
  };
}

export async function previewMerge(dup: UserProfile): Promise<MergePreview> {
  const g = await gather(dup);
  return {
    claims: g.claims.length,
    submitted: g.submitted.length,
    addedSites: g.sites.length,
    coordinators: g.coordinators.length,
    teamItems: g.teamClaims.length + g.teamSubmitted.length + g.teamSites.length,
  };
}

/** Why these two can't be merged, or null if they can. */
export function mergeBlocker(keep: UserProfile, dup: UserProfile): string | null {
  if (keep.uid === dup.uid) return 'Pick two different accounts.';
  if (keep.role === 'admin' || dup.role === 'admin') return 'Admin accounts can’t be merged.';
  if (isProvider(dup) && !isProvider(keep)) {
    return `${dup.email} is a ${accountLabel(dup)} account — keep that one and merge the public account into it instead.`;
  }
  return null;
}

/**
 * Admin-only: merges `dup` into `keep` — two accounts the same person made with different emails.
 * Everything `dup` owns (claims and their private contacts, submitted trials, added locations,
 * coordinators who work under them, team items pointing at them) moves to `keep`; blank profile
 * fields and phone numbers are filled from `dup`; `dup`'s email is remembered on `keep` (its
 * registry trials keep showing in "My Trials"); a verified status carries over. Then `dup` is
 * deleted with a tombstone, and the merge is audited.
 */
export async function mergeAccountsByAdmin(
  admin: AuditActor,
  keep: UserProfile,
  dup: UserProfile,
  requestId?: string,
): Promise<string> {
  const firestore = requireDb();
  const blocker = mergeBlocker(keep, dup);
  if (blocker) throw new Error(blocker);

  const g = await gather(dup);
  const w = new Writer();
  const keepIsPi = keep.role === 'doctor';
  const keepTeamPi = keepIsPi ? keep.uid : (keep.doctorUid ?? null);
  const keepRole = keep.role === 'doctor' ? 'doctor' : 'coordinator';

  // 1. What dup owns → keep.
  for (const d of g.claims) {
    w.update(d.ref, {
      claimedByUid: keep.uid,
      claimedByName: keep.name,
      claimedByEmail: keep.email,
      claimedByRole: keepRole,
      claimedByTitle: accountLabel(keep),
      ...(keepTeamPi ? { teamPiUid: keepTeamPi } : {}),
      updatedAt: serverTimestamp(),
      updatedByName: 'TrialWiz admin (account merge)',
    });
  }
  for (const d of g.privates) w.update(d.ref, { ownerUid: keep.uid, updatedAt: serverTimestamp() });
  for (const d of g.submitted) {
    w.update(d.ref, {
      submittedBy: keep.uid,
      submittedByName: keep.name,
      ...(keepTeamPi ? { doctorUid: keepTeamPi, teamPiUid: keepTeamPi } : {}),
    });
  }
  for (const d of g.sites) {
    w.update(d.ref, {
      addedByUid: keep.uid,
      addedByName: keep.name,
      addedByRole: keepRole,
      ...(keepTeamPi ? { teamPiUid: keepTeamPi } : {}),
    });
  }

  // 2. Teammates' work filed under dup as their PI → keep (only if keep is a PI too).
  if (keepIsPi) {
    for (const d of g.teamClaims) w.update(d.ref, { teamPiUid: keep.uid });
    for (const d of g.teamSites) w.update(d.ref, { teamPiUid: keep.uid });
    for (const d of g.teamSubmitted) {
      const t = d.data();
      w.update(d.ref, {
        ...(t.teamPiUid === dup.uid ? { teamPiUid: keep.uid } : {}),
        ...(t.doctorUid === dup.uid ? { doctorUid: keep.uid } : {}),
      });
    }
  }

  // 3. Coordinators working under dup.
  const keepApprovedPi = keepIsPi && (keep.status === 'approved' || dup.status === 'approved');
  for (const c of g.coordinators) {
    const ref = doc(firestore, USERS, c.uid);
    if (keepIsPi) {
      const stayApproved = keepApprovedPi && c.status === 'approved';
      w.update(ref, {
        requestedDoctorEmail: keep.email.trim().toLowerCase(),
        requestedDoctorName: keep.name,
        doctorUid: stayApproved ? keep.uid : null,
        status: stayApproved ? 'approved' : c.status === 'rejected' ? 'rejected' : 'pending',
      });
      if (stayApproved) {
        const log = doc(collection(firestore, 'teamApprovals'));
        w.set(log, {
          id: log.id,
          memberUid: c.uid,
          memberName: c.name,
          memberEmail: c.email,
          memberRole: 'coordinator',
          decision: 'approved',
          piUid: keep.uid,
          piName: keep.name,
          hospital: (c.facility || keep.facility || '').trim(),
          decidedByUid: admin.uid,
          decidedByName: admin.name ?? 'TrialWiz admin',
          decidedByEmail: admin.email,
          decidedByRole: 'admin',
          decidedAt: serverTimestamp(),
        });
      }
    } else {
      w.update(ref, { status: 'pending', doctorUid: null });
    }
  }

  // 4. keep's profile: fill blanks, remember dup's email, carry a verified status over.
  const patch: Record<string, unknown> = {
    mergedEmails: arrayUnion(...[dup.email, ...(dup.mergedEmails ?? [])].map((e) => e.trim().toLowerCase()).filter((e) => e && e !== keep.email.trim().toLowerCase())),
    mergedFromUids: arrayUnion(dup.uid, ...(dup.mergedFromUids ?? [])),
  };
  for (const k of ['facility', 'city', 'state', 'specialization'] as const) {
    if (!(keep[k] ?? '').trim() && (dup[k] ?? '').trim()) patch[k] = dup[k];
  }
  if (keep.role === 'doctor' && dup.role === 'doctor' && dup.status === 'approved' && keep.status !== 'approved') {
    Object.assign(patch, {
      status: 'approved',
      authorizedByUid: dup.authorizedByUid ?? admin.uid,
      authorizedByName: dup.authorizedByName ?? admin.name ?? 'TrialWiz admin',
      authorizedByRole: dup.authorizedByRole ?? 'admin',
      authorizedAt: dup.authorizedAt ?? serverTimestamp(),
    });
  }
  if (keep.role === 'coordinator' && dup.role === 'coordinator' && dup.status === 'approved' && keep.status !== 'approved') {
    Object.assign(patch, {
      status: 'approved',
      doctorUid: dup.doctorUid ?? null,
      requestedDoctorEmail: dup.requestedDoctorEmail ?? '',
      requestedDoctorName: dup.requestedDoctorName ?? '',
    });
  }
  w.update(doc(firestore, USERS, keep.uid), patch);

  const [keepPhones, dupPhones] = await Promise.all(
    [keep.uid, dup.uid].map(async (uid) => (await getDoc(doc(firestore, USER_CONTACTS, uid))).data() as UserContact | undefined),
  );
  if (dupPhones && (dupPhones.phone || dupPhones.publicPhone)) {
    w.set(doc(firestore, USER_CONTACTS, keep.uid), {
      uid: keep.uid,
      phone: keepPhones?.phone || dupPhones.phone || '',
      publicPhone: keepPhones?.publicPhone || dupPhones.publicPhone || '',
      updatedAt: serverTimestamp(),
    });
  }

  // 5. Remove dup.
  try {
    const favorites = await getDocs(collection(firestore, USERS, dup.uid, 'favorites'));
    favorites.docs.forEach((d) => w.delete(d.ref));
  } catch {
    // Admins can't list someone's saved trials (rules) — leftovers under a deleted uid are harmless.
  }
  w.delete(doc(firestore, USER_CONTACTS, dup.uid));
  w.delete(doc(firestore, USERS, dup.uid));
  w.set(doc(firestore, DELETED_ACCOUNTS_COLLECTION, dup.uid), {
    uid: dup.uid,
    email: dup.email,
    name: dup.name,
    accountType: accountLabel(dup),
    deletedByUid: admin.uid,
    deletedByEmail: admin.email,
    reason: `Merged into ${keep.name} <${keep.email}>`.slice(0, 300),
    mergedIntoUid: keep.uid,
    deletedAt: serverTimestamp(),
    authDeleted: false,
    allowReuse: false,
  });

  const summary = [
    g.claims.length && `${g.claims.length} claim(s)`,
    g.submitted.length && `${g.submitted.length} submitted trial(s)`,
    g.sites.length && `${g.sites.length} added location(s)`,
    g.coordinators.length && `${g.coordinators.length} coordinator(s)`,
    keepIsPi && g.teamClaims.length + g.teamSubmitted.length + g.teamSites.length && `${g.teamClaims.length + g.teamSubmitted.length + g.teamSites.length} team item(s)`,
  ].filter(Boolean) as string[];
  const audit = doc(collection(firestore, 'auditLog'));
  w.set(audit, {
    id: audit.id,
    action: 'accounts_merged',
    actorUid: admin.uid,
    actorEmail: admin.email,
    actorName: admin.name ?? '',
    target: `${dup.name} <${dup.email}> → ${keep.name} <${keep.email}>`.slice(0, 300),
    details: [`${accountLabel(dup)} merged into ${accountLabel(keep)}`, summary.length ? `moved ${summary.join(', ')}` : 'nothing else was linked']
      .join(' · ')
      .slice(0, 500),
    at: serverTimestamp(),
  });
  if (requestId) {
    w.update(doc(firestore, MERGE_REQUESTS_COLLECTION, requestId), { status: 'merged', decidedAt: serverTimestamp() });
  }
  await w.commit();
  return summary.length ? `moved ${summary.join(', ')}` : 'nothing else was linked to it';
}

/** Admin-only: every merge request, newest first. */
export function subscribeMergeRequests(onChange: (requests: MergeRequest[]) => void): () => void {
  if (!db) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    collection(db, MERGE_REQUESTS_COLLECTION),
    (snap) => onChange(snap.docs.map((d) => d.data() as MergeRequest)),
    (err) => {
      console.warn('[TrialWiz] merge request subscription failed:', err);
      onChange([]);
    },
  );
}

/** The signed-in user's own merge requests (as the account being kept). */
export function subscribeMyMergeRequests(uid: string, onChange: (requests: MergeRequest[]) => void): () => void {
  if (!db) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, MERGE_REQUESTS_COLLECTION), where('keepUid', '==', uid)),
    (snap) => onChange(snap.docs.map((d) => d.data() as MergeRequest)),
    () => onChange([]),
  );
}

export async function dismissMergeRequest(id: string): Promise<void> {
  await updateDoc(doc(requireDb(), MERGE_REQUESTS_COLLECTION, id), { status: 'dismissed', decidedAt: serverTimestamp() });
}

/**
 * A PI / coordinator asks to merge another account of theirs into the one they're signed in to.
 * They prove they own the other account by signing in to it (in a throwaway Firebase app, so their
 * own session is untouched); that account then confirms the request itself. An admin does the merge.
 */
export async function requestMerge(me: UserProfile, otherEmail: string, otherPassword: string, note = ''): Promise<void> {
  const firestore = requireDb();
  const email = otherEmail.trim();
  if (email.toLowerCase() === me.email.trim().toLowerCase()) throw new Error('That’s the account you’re signed in to — enter your other email.');
  const secondary = initializeApp(firebaseConfig, `merge_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  try {
    const otherAuth = getAuth(secondary);
    try {
      await signInWithEmailAndPassword(otherAuth, email, otherPassword);
    } catch {
      throw new Error('Couldn’t sign in to the other account — check its email and password.');
    }
    const otherUid = otherAuth.currentUser!.uid;
    const otherDb = getFirestore(secondary);
    const other = (await getDoc(doc(otherDb, USERS, otherUid))).data() as UserProfile | undefined;
    if (!other) throw new Error('That login has no TrialWiz profile — nothing to merge.');

    const ref = doc(collection(firestore, MERGE_REQUESTS_COLLECTION));
    const req: MergeRequest = {
      id: ref.id,
      keepUid: me.uid,
      keepEmail: me.email,
      keepName: me.name,
      dupUid: otherUid,
      dupEmail: other.email,
      dupName: other.name,
      dupConfirmed: false,
      status: 'pending',
      note: note.trim().slice(0, 300),
      createdAt: serverTimestamp(),
    };
    await setDoc(ref, req);
    // The other account confirms with its own session.
    await updateDoc(doc(otherDb, MERGE_REQUESTS_COLLECTION, ref.id), { dupConfirmed: true });
    await signOut(otherAuth);
  } finally {
    await deleteApp(secondary).catch(() => {});
  }
}
