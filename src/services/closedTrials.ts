import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { ClosedTrial, TrialClaim, UserProfile } from '../types';
import { writeAudit } from './audit';

export const CLOSED_TRIALS_COLLECTION = 'closedTrials';

function requireDb() {
  if (!db) throw new Error('Firebase is not configured — see README.md.');
  return db;
}

const norm = (v?: string) => (v ?? '').trim().toLowerCase();

function siteLabel(c: { nctId: string; facility: string; city?: string }): string {
  return `${c.nctId} @ ${[c.facility, c.city].filter(Boolean).join(', ')}`;
}

/** What gets closed: one site of one trial. */
export interface CloseTarget {
  nctId: string;
  facility: string;
  city?: string;
  state?: string;
  hospitalName?: string;
  briefTitle?: string;
  cancerType?: string;
}

export interface CloseActor {
  uid: string;
  name: string;
  email: string;
}

function hashKey(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Repository doc id for a site that has no claim (admin closes any site). */
export function siteCloseId(t: Pick<CloseTarget, 'nctId' | 'facility' | 'city'>): string {
  return `site__${t.nctId.replace(/[^A-Za-z0-9_-]/g, '_')}__${hashKey(`${norm(t.facility)}|${norm(t.city)}`)}`;
}

/** Repository doc id for a hospital-submitted (TW-) trial closed by whoever created it. */
export function submittedCloseId(nctId: string): string {
  return `sub__${nctId}`;
}

/**
 * Marks one trial site as closed. Who may do it is enforced in firestore.rules:
 *  - an admin, any site (doc id: the claim id, or `siteCloseId`);
 *  - an approved Principal Investigator, a claimed site — their own claim, one at their hospital,
 *    or one by a coordinator they approved (doc id: the claim id);
 *  - whoever submitted a TW- trial, or their PI's team (doc id: `submittedCloseId`).
 * The closure goes to the `closedTrials` repository and the audit trail; every catalogue row
 * matching it disappears from the active lists (public finder, portal, admin catalogue).
 */
export async function closeTrialSite(id: string, target: CloseTarget, actor: CloseActor, reason: string): Promise<void> {
  const firestore = requireDb();
  const record: Record<string, unknown> = {
    id,
    claimId: id,
    nctId: target.nctId,
    facility: target.facility,
    city: target.city ?? '',
    state: target.state ?? '',
    hospitalName: target.hospitalName ?? '',
    briefTitle: target.briefTitle ?? '',
    cancerType: target.cancerType ?? '',
    reason: reason.trim().slice(0, 500),
    closedByUid: actor.uid,
    closedByName: actor.name,
    closedByEmail: actor.email,
    closedAt: serverTimestamp(),
  };
  await setDoc(doc(firestore, CLOSED_TRIALS_COLLECTION, id), record);
  await writeAudit(actor, 'trial_closed', siteLabel(target), reason.trim() || undefined).catch((e) =>
    console.warn('[TrialWiz] audit write failed (trial closed):', e),
  );
}

/** A PI closing a claimed site — the repository doc is keyed by the claim id. */
export async function closeTrial(claim: TrialClaim, pi: UserProfile, reason: string): Promise<void> {
  await closeTrialSite(claim.id, claim, { uid: pi.uid, name: pi.name, email: pi.email }, reason);
}

/** Puts a closed site back into the active lists. Whoever closed it, or an admin, may do this. */
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
