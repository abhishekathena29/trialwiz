import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore';
import { db } from '../firebase';
import { accountLabel, type AddedSite, type SubmittedTrial, type TrialClaim, type UserProfile } from '../types';
import { ADDED_SITES_COLLECTION } from './addedSites';
import type { AuditActor } from './audit';
import { CLAIM_PRIVATE_COLLECTION, CLAIMS_COLLECTION } from './trialClaims';
import { SUBMITTED_TRIALS_COLLECTION } from './trialSubmissions';

/** Tombstones of accounts an admin deleted, at `deletedAccounts/{uid}`. The browser can't delete
 * another user's Firebase Auth login (that needs the Admin SDK), so the login lingers until
 * `npm run purge-deleted-accounts` removes it. Meanwhile this doc blocks sign-in (LoginPage) and
 * re-creating a profile under that uid (firestore.rules). */
export const DELETED_ACCOUNTS_COLLECTION = 'deletedAccounts';
const USERS = 'users';
const USER_CONTACTS = 'userContacts';

function requireDb() {
  if (!db) throw new Error('Firebase is not configured — see README.md.');
  return db;
}

/** Everything that hangs off an account and needs a decision before it's deleted. */
export interface DeletionPlan {
  /** Coordinators approved under (or waiting on) this PI. */
  coordinators: UserProfile[];
  claims: TrialClaim[];
  submitted: SubmittedTrial[];
  addedSites: AddedSite[];
}

export async function loadDeletionPlan(account: UserProfile): Promise<DeletionPlan> {
  const firestore = requireDb();
  const rows = async <T,>(col: string, field: string, value: string) =>
    (await getDocs(query(collection(firestore, col), where(field, '==', value)))).docs.map((d) => d.data() as T);
  const [linked, named, claims, submitted, addedSites] = await Promise.all([
    rows<UserProfile>(USERS, 'doctorUid', account.uid),
    account.role === 'doctor'
      ? rows<UserProfile>(USERS, 'requestedDoctorEmail', account.email.trim().toLowerCase())
      : Promise.resolve([] as UserProfile[]),
    rows<TrialClaim>(CLAIMS_COLLECTION, 'claimedByUid', account.uid),
    rows<SubmittedTrial>(SUBMITTED_TRIALS_COLLECTION, 'submittedBy', account.uid),
    rows<AddedSite>(ADDED_SITES_COLLECTION, 'addedByUid', account.uid),
  ]);
  const coordinators = new Map<string, UserProfile>();
  for (const c of [...linked, ...named]) if (c.role === 'coordinator' && c.uid !== account.uid) coordinators.set(c.uid, c);
  return { coordinators: [...coordinators.values()], claims, submitted, addedSites };
}

export interface DeletionChoices {
  /** Approved PI that coordinators move under and/or owned data transfers to. */
  transferTo?: UserProfile;
  /** 'move' needs `transferTo`; 'pending' unlinks them so they name a PI again. */
  coordinators: 'move' | 'pending';
  /** 'transfer' needs `transferTo`; 'delete' removes the claims / trials / locations. */
  data: 'transfer' | 'delete';
  /** Free-text reason for the audit trail, e.g. "duplicate of x@y". */
  reason?: string;
  /** Let the same email sign up again (e.g. they registered under the wrong role). */
  allowReuse?: boolean;
}

/** Firestore batches cap at 500 writes; commit in chunks. */
export class Writer {
  private ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
  set(ref: DocumentReference, data: Record<string, unknown>) {
    this.ops.push((b) => b.set(ref, data));
  }
  update(ref: DocumentReference, data: Record<string, unknown>) {
    this.ops.push((b) => b.update(ref, data));
  }
  delete(ref: DocumentReference) {
    this.ops.push((b) => b.delete(ref));
  }
  async commit() {
    const firestore = requireDb();
    for (let i = 0; i < this.ops.length; i += 450) {
      const batch = writeBatch(firestore);
      this.ops.slice(i, i + 450).forEach((op) => op(batch));
      await batch.commit();
    }
  }
}

/**
 * Admin-only: deletes an account from the app. Linked coordinators are moved to another PI or set
 * back to pending; claims, submitted trials and added locations are transferred to that PI or
 * deleted. Then the profile, phone numbers, saved trials and personal claim contacts are removed,
 * a `deletedAccounts` tombstone is written, and the whole thing is audited.
 *
 * The person's Firebase Auth login itself survives until `npm run purge-deleted-accounts` (the
 * browser can't delete other users' logins); the tombstone stops it being used meanwhile.
 */
export async function deleteAccountByAdmin(
  admin: AuditActor,
  account: UserProfile,
  plan: DeletionPlan,
  choices: DeletionChoices,
): Promise<string> {
  const firestore = requireDb();
  if (account.role === 'admin') throw new Error('Admin accounts can’t be deleted here.');
  if (account.uid === admin.uid) throw new Error('You can’t delete your own account.');
  const to = choices.transferTo;
  const needsTarget =
    (choices.coordinators === 'move' && plan.coordinators.length > 0) ||
    (choices.data === 'transfer' && plan.claims.length + plan.submitted.length + plan.addedSites.length > 0);
  if (needsTarget && (!to || to.role !== 'doctor' || to.status !== 'approved' || to.uid === account.uid)) {
    throw new Error('Choose an approved Principal Investigator to move things to.');
  }

  const w = new Writer();
  const summary: string[] = [];

  // Coordinators
  for (const c of plan.coordinators) {
    const ref = doc(firestore, USERS, c.uid);
    if (choices.coordinators === 'move' && to) {
      w.update(ref, {
        doctorUid: c.status === 'approved' ? to.uid : null,
        requestedDoctorEmail: to.email.trim().toLowerCase(),
        requestedDoctorName: to.name,
      });
      if (c.status === 'approved') {
        const log = doc(collection(firestore, 'teamApprovals'));
        w.set(log, {
          id: log.id,
          memberUid: c.uid,
          memberName: c.name,
          memberEmail: c.email,
          memberRole: 'coordinator',
          decision: 'approved',
          piUid: to.uid,
          piName: to.name,
          hospital: (c.facility || to.facility || '').trim(),
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
  if (plan.coordinators.length) {
    summary.push(
      `${plan.coordinators.length} coordinator(s) ${choices.coordinators === 'move' && to ? `moved to ${to.name} <${to.email}>` : 'set back to pending'}`,
    );
  }

  // Owned data
  const transfer = choices.data === 'transfer' && to;
  for (const c of plan.claims) {
    const ref = doc(firestore, CLAIMS_COLLECTION, c.id);
    // Personal (non-public) contacts belong to the person being deleted — always removed.
    w.delete(doc(firestore, CLAIM_PRIVATE_COLLECTION, c.id));
    if (transfer) {
      w.update(ref, {
        claimedByUid: to.uid,
        claimedByName: to.name,
        claimedByEmail: to.email,
        claimedByRole: 'doctor',
        claimedByTitle: accountLabel(to),
        teamPiUid: to.uid,
        updatedAt: serverTimestamp(),
        updatedByName: 'TrialWiz admin',
      });
    } else {
      w.delete(ref);
    }
  }
  for (const t of plan.submitted) {
    const ref = doc(firestore, SUBMITTED_TRIALS_COLLECTION, t.nctId);
    if (transfer) w.update(ref, { submittedBy: to.uid, submittedByName: to.name, doctorUid: to.uid, teamPiUid: to.uid });
    else w.delete(ref);
  }
  for (const s of plan.addedSites) {
    const ref = doc(firestore, ADDED_SITES_COLLECTION, s.id);
    if (transfer) w.update(ref, { addedByUid: to.uid, addedByName: to.name, addedByRole: 'doctor', teamPiUid: to.uid });
    else w.delete(ref);
  }
  const owned = plan.claims.length + plan.submitted.length + plan.addedSites.length;
  if (owned) {
    summary.push(
      `${plan.claims.length} claim(s), ${plan.submitted.length} submitted trial(s), ${plan.addedSites.length} added location(s) ${transfer ? `transferred to ${to.name}` : 'deleted'}`,
    );
  }

  // The account itself
  const favorites = await getDocs(collection(firestore, USERS, account.uid, 'favorites'));
  favorites.docs.forEach((d) => w.delete(d.ref));
  const privateContacts = await getDocs(
    query(collection(firestore, CLAIM_PRIVATE_COLLECTION), where('ownerUid', '==', account.uid)),
  );
  privateContacts.docs.forEach((d) => w.delete(d.ref));
  w.delete(doc(firestore, USER_CONTACTS, account.uid));
  w.delete(doc(firestore, USERS, account.uid));
  w.set(doc(firestore, DELETED_ACCOUNTS_COLLECTION, account.uid), {
    uid: account.uid,
    email: account.email,
    name: account.name,
    accountType: accountLabel(account),
    deletedByUid: admin.uid,
    deletedByEmail: admin.email,
    reason: (choices.reason ?? '').trim().slice(0, 300),
    deletedAt: serverTimestamp(),
    authDeleted: false,
    allowReuse: Boolean(choices.allowReuse),
  });
  const audit = doc(collection(firestore, 'auditLog'));
  w.set(audit, {
    id: audit.id,
    action: 'account_deleted',
    actorUid: admin.uid,
    actorEmail: admin.email,
    actorName: admin.name ?? '',
    target: `${account.name} <${account.email}>`.slice(0, 300),
    details: [accountLabel(account), choices.reason?.trim(), ...summary].filter(Boolean).join(' · ').slice(0, 500),
    at: serverTimestamp(),
  });
  await w.commit();
  return summary.length ? summary.join('; ') : 'nothing else was linked to it';
}

/**
 * Has an admin deleted this account? Checked at sign-in and sign-up.
 *  - 'active'    — not deleted, or deleted with "may sign up again" and the person already has.
 *  - 'reusable'  — deleted, but the admin let this email sign up again: no profile yet.
 *  - 'blocked'   — deleted, email not released.
 */
export async function deletedAccountState(uid: string): Promise<'active' | 'reusable' | 'blocked'> {
  if (!db) return 'active';
  try {
    const tomb = await getDoc(doc(db, DELETED_ACCOUNTS_COLLECTION, uid));
    if (!tomb.exists()) return 'active';
    if (!tomb.data().allowReuse) return 'blocked';
    return (await getDoc(doc(db, USERS, uid))).exists() ? 'active' : 'reusable';
  } catch {
    return 'active';
  }
}
