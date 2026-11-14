/** Milliseconds for a Firestore Timestamp / Date / ISO string; null when missing or pending. */
export function timestampMs(v: unknown): number | null {
  if (v instanceof Date) return v.getTime();
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as { toMillis: () => number }).toMillis();
  if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) return Date.parse(v);
  return null;
}

/** Formats a Firestore Timestamp (or Date / ISO string) for display; '—' while a server
 * timestamp is still pending or the value is missing. */
export function formatTimestamp(v: unknown): string {
  let d: Date | null = null;
  if (v instanceof Date) d = v;
  else if (v && typeof (v as { toDate?: unknown }).toDate === 'function') d = (v as { toDate: () => Date }).toDate();
  else if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) d = new Date(v);
  return d ? d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}
