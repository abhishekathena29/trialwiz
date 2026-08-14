import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export const USAGE_LOG_COLLECTION = 'usageEvents';

export type UsageEventType = 'search' | 'browse' | 'location' | 'click' | 'signup' | 'signin' | 'favorite';

/**
 * Records one interaction as an aggregate, de-identified usage signal — same guardrail as
 * demandLog: no patient identity, no linkage to a person or device. Fire-and-forget.
 */
export function logUsage(type: UsageEventType, label: string, meta?: string): void {
  if (!db) return; // Firebase not configured yet — see README
  addDoc(collection(db, USAGE_LOG_COLLECTION), {
    type,
    label: (label || '').slice(0, 200),
    meta: (meta ?? '').slice(0, 200),
    createdAt: serverTimestamp(),
  }).catch((err) => {
    console.warn('[TrialWiz] usage log write failed (non-fatal):', err);
  });
}
