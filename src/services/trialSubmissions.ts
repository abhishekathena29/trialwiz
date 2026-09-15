import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { SubmittedTrial } from '../types';

export const SUBMITTED_TRIALS_COLLECTION = 'submittedTrials';

function requireDb() {
  if (!db) throw new Error('Firebase is not configured — see README.md.');
  return db;
}

/** Visibly distinct from a real ClinicalTrials.gov `NCT########` id. */
export function generateSubmittedTrialId(): string {
  return `TW-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

export type NewSubmittedTrial = Omit<SubmittedTrial, 'createdAt' | 'listingStatus'>;

/** Firestore rejects `undefined` field values — the add-trial form leaves plenty of optional
 * fields (state, contact details, dates…) as `undefined` when left blank, so those keys must
 * be dropped rather than written. */
function stripUndefined<T extends object>(obj: T): T {
  const out = {} as T;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export async function submitTrial(trial: NewSubmittedTrial): Promise<void> {
  const firestore = requireDb();
  await setDoc(
    doc(firestore, SUBMITTED_TRIALS_COLLECTION, trial.nctId),
    stripUndefined({
      ...trial,
      listingStatus: 'published' as const,
      createdAt: serverTimestamp(),
    }),
  );
}

export async function updateSubmittedTrial(nctId: string, patch: Partial<SubmittedTrial>): Promise<void> {
  const firestore = requireDb();
  await updateDoc(doc(firestore, SUBMITTED_TRIALS_COLLECTION, nctId), patch);
}

export async function retireSubmittedTrial(nctId: string): Promise<void> {
  await updateSubmittedTrial(nctId, { listingStatus: 'retired' });
}

export async function republishSubmittedTrial(nctId: string): Promise<void> {
  await updateSubmittedTrial(nctId, { listingStatus: 'published' });
}

/** Live subscription to every published submitted trial — merged into the public dataset. */
export function subscribePublishedTrials(onChange: (trials: SubmittedTrial[]) => void): () => void {
  if (!db) {
    onChange([]);
    return () => {};
  }
  const q = query(collection(db, SUBMITTED_TRIALS_COLLECTION), where('listingStatus', '==', 'published'));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => d.data() as SubmittedTrial)),
    (err) => {
      console.warn('[TrialWiz] submitted-trials subscription failed:', err);
      onChange([]);
    },
  );
}

/** Live subscription to one coordinator's own submissions (any listing status), for their
 * "My submitted trials" screen. */
export function subscribeMySubmittedTrials(uid: string, onChange: (trials: SubmittedTrial[]) => void): () => void {
  if (!db) {
    onChange([]);
    return () => {};
  }
  const q = query(
    collection(db, SUBMITTED_TRIALS_COLLECTION),
    where('submittedBy', '==', uid),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => d.data() as SubmittedTrial)),
    (err) => {
      console.warn('[TrialWiz] my-submitted-trials subscription failed:', err);
      onChange([]);
    },
  );
}
