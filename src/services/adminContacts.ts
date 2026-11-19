import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

/** Admin's private outreach tracker, one doc per account at `adminContacts/{uid}` — "have I
 * contacted this doctor yet, and what did we say". Admin-only (see firestore.rules); the doctor
 * never sees it. */
export interface AdminContactMark {
  uid: string;
  contacted: boolean;
  note?: string;
  contactedAt?: unknown;
  updatedByEmail?: string;
  updatedAt?: unknown;
}

const COLLECTION = 'adminContacts';

export function subscribeAdminContacts(onChange: (marks: Map<string, AdminContactMark>) => void): () => void {
  if (!db) {
    onChange(new Map());
    return () => {};
  }
  return onSnapshot(
    collection(db, COLLECTION),
    (snap) => onChange(new Map(snap.docs.map((d) => [d.id, d.data() as AdminContactMark]))),
    (err) => {
      console.warn('[TrialWiz] admin contacts subscription failed:', err);
      onChange(new Map());
    },
  );
}

export async function setAdminContact(
  uid: string,
  patch: { contacted?: boolean; note?: string },
  adminEmail: string,
): Promise<void> {
  if (!db) throw new Error('Firebase is not configured — see README.md.');
  const data: Record<string, unknown> = { uid, updatedByEmail: adminEmail, updatedAt: serverTimestamp() };
  if (patch.contacted !== undefined) {
    data.contacted = patch.contacted;
    data.contactedAt = patch.contacted ? serverTimestamp() : null;
  }
  if (patch.note !== undefined) data.note = patch.note.trim().slice(0, 500);
  await setDoc(doc(db, COLLECTION, uid), data, { merge: true });
}
