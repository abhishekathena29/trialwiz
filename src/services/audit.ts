import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { AuditAction, AuditEntry } from '../types';

export const AUDIT_COLLECTION = 'auditLog';

export interface AuditActor {
  uid: string;
  email: string;
  name?: string;
}

/** Appends one entry to the audit trail. Entries are create-only (see firestore.rules) —
 * nobody, not even an admin, can edit or delete them from the app. */
export async function writeAudit(
  actor: AuditActor,
  action: AuditAction,
  target: string,
  details?: string,
): Promise<void> {
  if (!db) throw new Error('Firebase is not configured — see README.md.');
  const ref = doc(collection(db, AUDIT_COLLECTION));
  const entry: Record<string, unknown> = {
    id: ref.id,
    action,
    actorUid: actor.uid,
    actorEmail: actor.email,
    actorName: actor.name ?? '',
    target: target.slice(0, 300),
    details: (details ?? '').slice(0, 500),
    at: serverTimestamp(),
  };
  await setDoc(ref, entry);
}

/** Admin-only: the most recent audit entries, newest first. */
export function subscribeAuditLog(onChange: (entries: AuditEntry[]) => void, max = 200): () => void {
  if (!db) {
    onChange([]);
    return () => {};
  }
  const q = query(collection(db, AUDIT_COLLECTION), orderBy('at', 'desc'), limit(max));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => d.data() as AuditEntry)),
    (err) => {
      console.warn('[TrialWiz] audit log subscription failed:', err);
      onChange([]);
    },
  );
}
