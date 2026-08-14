export function daysSince(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

export function initials(name: string): string {
  return name
    .replace(/[^A-Za-z ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

export function telHref(phone: string | undefined): string {
  return phone ? phone.replace(/[^+\d]/g, '') : '';
}

/** ClinicalTrials.gov facility names are often generic ("Research Site", "Site 001") and
 * repeat across many unrelated hospitals — key by facility+city so those don't get merged. */
export function centreKey(facility: string, city: string): string {
  return `${facility}__${city}`;
}
