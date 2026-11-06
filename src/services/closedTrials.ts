import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { ClosedTrial, TrialClaim, UserProfile } from '../types';
import { writeAudit } from './audit';

export const CLOSED_TRIALS_COLLECTION = 'closedTrials';

function requireDb() {
  if (!db) throw new Error('Firebase is not configured — see README.md.');
  return db;
}

function siteLabel(c: { nctId: string; facility: string; city?: string }): string {
  return `${c.nctId} @ ${[c.facility, c.city].filter(Boolean).join(', ')}`;
}

/**
 * Marks a claimed trial site as closed. Only an approved Principal Investigator may do this
 * (enforced in firestore.rules). The closure is stored in the `closedTrials` repository — keyed
 * by the claim id, so it's one per site — and recorded in the audit trail. Every catalogue row
 * matching it disappears from the active lists (public finder, portal, admin catalogue).
 */
export async function closeTrial(claim: TrialClaim, pi: UserProfile, reason: string): Promise<void> {
  const firestore = requireDb();
  const record: Record<string, unknown> = {
    id: claim.id,
    claimId: claim.id,
    nctId: claim.nctId,
    facility: claim.facility,
    city: claim.city ?? '',
    state: claim.state ?? '',
    hospitalName: claim.hospitalName ?? '',
    briefTitle: claim.briefTitle ?? '',
    cancerType: claim.cancerType ?? '',
    reason: reason.trim().slice(0, 500),
    closedByUid: pi.uid,
    closedByName: pi.name,
    closedByEmail: pi.email,
    closedAt: serverTimestamp(),
  };
  await setDoc(doc(firestore, CLOSED_TRIALS_COLLECTION, claim.id), record);
  await writeAudit(pi, 'trial_closed', siteLabel(claim), reason.trim() || undefined).catch((e) =>
    console.warn('[TrialWiz] audit write failed (trial closed):', e),
  );
}

/** Puts a closed site back into the active lists. The closing PI or an admin may do this. */
export async function reopenTrial(
  closed: ClosedTrial,
  actor: { uid: string; email: string; name?: string },
): Promise<void> {
  const firestore = requireDb();
  await deleteDoc(doc(firestore, CLOSED_TRIALS_COLLECTION, closed.id));
  await writeAudit(actor, 'trial_reopened', siteLabel(closed)).catch((e) =>
    console.warn('[TrialWiz] audit write failed (trial reopened):', e),
  );
}

/** Live view of the whole closed-trial repository (publicly readable, so the public finder can
 * hide closed sites). */
export function subscribeClosedTrials(onChange: (closed: ClosedTrial[]) => void): () => void {
  if (!db) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, CLOSED_TRIALS_COLLECTION)),
    (snap) => onChange(snap.docs.map((d) => d.data() as ClosedTrial)),
    (err) => {
      console.warn('[TrialWiz] closed-trials subscription failed:', err);
      onChange([]);
    },
  );
}

const norm = (v?: string) => (v ?? '').trim().toLowerCase();

/** Same matching rule as `claimMatchesSite`: NCT id + facility, and city when both sides have one. */
export function isSiteClosed(
  closed: ClosedTrial[],
  nctId: string,
  site: { facility: string; city?: string },
): boolean {
  return closed.some(
    (c) =>
      c.nctId === nctId &&
      norm(c.facility) === norm(site.facility) &&
      (!c.city || !site.city || norm(c.city) === norm(site.city)),
  );
}
