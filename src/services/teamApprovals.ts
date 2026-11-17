import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { TeamApproval, UserProfile } from '../types';
import { writeAudit } from './audit';

export const TEAM_APPROVALS_COLLECTION = 'teamApprovals';
// Same value as profiles.USERS_COLLECTION — not imported, to keep this module free of a cycle.
const USERS = 'users';

function requireDb() {
  if (!db) throw new Error('Firebase is not configured — see README.md.');
  return db;
}

export interface TeamDecider {
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'pi';
}

function record(
  id: string,
  member: UserProfile,
  decision: 'approved' | 'rejected',
  pi: { uid: string; name: string; facility?: string },
  by: TeamDecider,
): Record<string, unknown> {
  return {
    id,
    memberUid: member.uid,
    memberName: member.name,
    memberEmail: member.email,
    memberRole: 'coordinator',
    decision,
    piUid: pi.uid,
    piName: pi.name,
    hospital: (member.facility || pi.facility || '').trim(),
    decidedByUid: by.uid,
    decidedByName: by.name,
    decidedByEmail: by.email,
    decidedByRole: by.role,
    decidedAt: serverTimestamp(),
  };
}

/**
 * A PI approves or rejects a trial coordinator who named them at sign-up. The
 * status change and the log entry are one atomic batch (firestore.rules checks the log entry
 * against the profile's post-write state), so no coordinator is ever approved without a record
 * of who approved them.
 */
export async function decideTeamMember(
  member: UserProfile,
  decision: 'approved' | 'rejected',
  pi: UserProfile,
): Promise<void> {
  const firestore = requireDb();
  const logRef = doc(collection(firestore, TEAM_APPROVALS_COLLECTION));
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, USERS, member.uid), {
    status: decision,
    doctorUid: decision === 'approved' ? pi.uid : null,
  });
  batch.set(logRef, record(logRef.id, member, decision, pi, { uid: pi.uid, name: pi.name, email: pi.email, role: 'pi' }));
  await batch.commit();
  await writeAudit(
    { uid: pi.uid, email: pi.email, name: pi.name },
    'team_member_decided',
    `${member.name} <${member.email}>`,
    `Trial Coordinator ${decision} by Principal Investigator ${pi.name}`,
  ).catch((e) => console.warn('[TrialWiz] audit write failed (team decision):', e));
}

/** Log entry for a coordinator an admin created already-approved under a PI. */
export async function recordAdminCreatedTeamMember(member: UserProfile, pi: UserProfile, admin: TeamDecider): Promise<void> {
  const firestore = requireDb();
  const ref = doc(collection(firestore, TEAM_APPROVALS_COLLECTION));
  await setDoc(ref, record(ref.id, member, 'approved', pi, admin));
}

function subscribe(q: ReturnType<typeof query>, onChange: (rows: TeamApproval[]) => void): () => void {
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => d.data() as TeamApproval)),
    (err) => {
      console.warn('[TrialWiz] team approval log subscription failed:', err);
      onChange([]);
    },
  );
}

/** Admin-only: every team approval decision, newest first. */
export function subscribeAllTeamApprovals(onChange: (rows: TeamApproval[]) => void): () => void {
  if (!db) {
    onChange([]);
    return () => {};
  }
  return subscribe(query(collection(db, TEAM_APPROVALS_COLLECTION), orderBy('decidedAt', 'desc')), onChange);
}

/** A PI's own team decisions (sorted client-side, so no composite index is needed). */
export function subscribePiTeamApprovals(piUid: string, onChange: (rows: TeamApproval[]) => void): () => void {
  if (!db) {
    onChange([]);
    return () => {};
  }
  return subscribe(query(collection(db, TEAM_APPROVALS_COLLECTION), where('piUid', '==', piUid)), onChange);
}
