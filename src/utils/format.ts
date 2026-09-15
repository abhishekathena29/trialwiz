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
 * repeat across many unrelated hospitals — key by facility+city so those don't get merged.
 *
 * The same real centre also shows up under wildly different free-text strings across
 * different studies — e.g. all of these are the same Mumbai hospital:
 *   "Tata Memorial Hospital", "Tata Memorial Hospital, Parel", "Tata Memorial Hospital -
 *   Mumbai /ID# 269177", "Tata Memorial Hospital-Medical Oncology ( Site 2053)",
 *   "Tata Memorial Hospital, Mumbai, India"
 * The heuristics below — drop the trailing descriptor after the first comma/dash/paren/
 * slash, drop site numbers and IDs, drop generic institutional words and the row's own
 * city name — collapse those to one key without a hardcoded alias table. */

const GENERIC_WORDS = new Set([
  'hospital', 'hospitals', 'centre', 'center', 'institute', 'institution', 'medical',
  'college', 'research', 'national', 'foundation', 'trust', 'clinic', 'clinics', 'memorial',
  'cancer', 'of', 'and', 'the', 'india', 'site', 'unit', 'branch', 'department', 'dept', 'block', 'ward',
]);

function stripDiacritics(s: string): string {
  // \p{M} matches any Unicode combining mark (accents, diacritics) left behind by NFKD
  // decomposition — e.g. "ā" -> "a" + a combining macron, which this then drops.
  return s.normalize('NFKD').replace(/\p{M}/gu, '');
}

/** Most registry facility strings are "Canonical Name, extra descriptor" / "... - extra" /
 * "...( extra )" / ".../ extra" — the part before the first such delimiter is the actual
 * institution name; everything after tends to be a department, site code, or address. */
function leadingSegment(s: string): string {
  const m = /^[^,\-([/]+/.exec(s);
  return m ? m[0] : s;
}

function words(s: string): string[] {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function coreTokens(facility: string, city: string): string {
  const cityWords = new Set(words(city));
  const raw = words(leadingSegment(facility)).filter((w) => w.length > 1 && !cityWords.has(w));
  // Prefer the non-generic "identity" words (e.g. "tata" out of "Tata Memorial Hospital") —
  // but if a facility's name is made up *entirely* of generic/placeholder words ("Research
  // Site", "Cancer Institute"), stripping them all would collapse it onto every other
  // genuinely-unrelated placeholder-named facility in the same city. Fall back to the raw,
  // un-stripped words in that case so distinct placeholder names stay distinct.
  const significant = raw.filter((w) => !GENERIC_WORDS.has(w));
  return (significant.length > 0 ? significant : raw).sort().join(' ');
}

export function centreKey(facility: string, city: string): string {
  return `${coreTokens(facility, city)}__${words(city).join(' ')}`;
}
