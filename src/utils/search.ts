/** Case-insensitive "does any of these fields contain the query" — used by the admin searches. */
export function matchesSearch(query: string, fields: Array<string | undefined | null>): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => (f ?? '').toLowerCase().includes(q));
}
