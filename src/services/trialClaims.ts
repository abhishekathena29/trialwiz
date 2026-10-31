import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { TrialClaim } from '../types';

export const CLAIMS_COLLECTION = 'trialClaims';

function requireDb() {
  if (!db) throw new Error('Firebase is not configured — see README.md.');
  return db;
}

/** One claim per NCT ID + site. Pass `city` for new claims so same-named facilities in
 * different cities don't collide; older claims were keyed by facility alone. */
export function makeClaimId(nctId: string, facility: string, city?: string): string {
  const cleanFac = (city ? `${facility} ${city}` : facility)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 60);
  return `${nctId}__${cleanFac}`;
}

const norm = (v?: string) => (v ?? '').trim().toLowerCase();

/** Does this claim belong to this NCT ID at this site? Older claims have no city, so match on facility alone then. */
export function claimMatchesSite(
  claim: TrialClaim,
  nctId: string,
  site: { facility: string; city?: string },
): boolean {
  if (claim.nctId !== nctId || norm(claim.facility) !== norm(site.facility)) return false;
  return !claim.city || !site.city || norm(claim.city) === norm(site.city);
}

function stripUndefined<T extends object>(obj: T): T {
  const out = {} as T;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export async function claimTrial(
  claimData: Omit<TrialClaim, 'claimedAt' | 'updatedAt'>,
): Promise<void> {
  const firestore = requireDb();
  const id = claimData.id || makeClaimId(claimData.nctId, claimData.facility, claimData.city);
  await setDoc(
    doc(firestore, CLAIMS_COLLECTION, id),
    stripUndefined({
      ...claimData,
      id,
      claimedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
}

export async function unclaimTrial(claimId: string): Promise<void> {
  const firestore = requireDb();
  await deleteDoc(doc(firestore, CLAIMS_COLLECTION, claimId));
}

/** Subscribe to all verified trial claims for public search and admin oversight. */
export function subscribeAllClaims(onChange: (claims: TrialClaim[]) => void): () => void {
  if (!db) {
    onChange([]);
    return () => {};
  }
  const q = query(collection(db, CLAIMS_COLLECTION));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => d.data() as TrialClaim)),
    (err) => {
      console.warn('[TrialWiz] claims subscription failed:', err);
      onChange([]);
    },
  );
}

/** Subscribe to claims made by a specific investigator or coordinator. */
export function subscribeUserClaims(uid: string, onChange: (claims: TrialClaim[]) => void): () => void {
  if (!db) {
    onChange([]);
    return () => {};
  }
  const q = query(collection(db, CLAIMS_COLLECTION), where('claimedByUid', '==', uid));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => d.data() as TrialClaim)),
    (err) => {
      console.warn('[TrialWiz] user claims subscription failed:', err);
      onChange([]);
    },
  );
}
