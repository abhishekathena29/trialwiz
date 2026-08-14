import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { DemandLogEvent } from '../types';

export const DEMAND_LOG_COLLECTION = 'demandLog';

/**
 * Records one search as an aggregate, de-identified demand signal — no patient identity,
 * no linkage to a person or device. Fire-and-forget: a logging failure must never block
 * or surface in the public search UI.
 */
export function logDemand(event: DemandLogEvent): void {
  if (!db) return; // Firebase not configured yet — see README
  addDoc(collection(db, DEMAND_LOG_COLLECTION), {
    ...event,
    createdAt: serverTimestamp(),
  }).catch((err) => {
    console.warn('[TrialWiz] demand log write failed (non-fatal):', err);
  });
}
