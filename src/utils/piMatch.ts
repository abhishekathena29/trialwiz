import type { TrialSite } from '../types';
import { stripDiacritics } from './format';

/** Honorifics and degrees that registries put around an investigator's name. */
const NOISE = new Set([
  'dr', 'doctor', 'prof', 'professor', 'mr', 'mrs', 'ms', 'miss', 'shri', 'smt',
  'md', 'dm', 'ms', 'mbbs', 'mch', 'dnb', 'frcp', 'frcs', 'phd', 'mrcp', 'site', 'pi',
]);

/** Name → comparable tokens: lower-case, no accents/punctuation/titles/site numbers. */
export function nameTokens(name: string | undefined): string[] {
  return stripDiacritics(name ?? '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !NOISE.has(t));
}

/** Every token of `part` is in `whole` — a one-letter token (an initial) matches any word
 * starting with it. `part` must carry a real name (a word of 3+ letters), so a bare initial or
 * "Dr" never matches anything. */
function covers(part: string[], whole: string[]): boolean {
  if (!part.some((t) => t.length >= 3)) return false;
  const set = new Set(whole);
  return part.every((t) => (t.length === 1 ? whole.some((w) => w.startsWith(t)) : set.has(t)));
}

/**
 * Is this registry contact the same person as the investigator? "Ullas Batra" matches
 * "Dr. Ullas Batra" and "Ullas Batra, Site 0337"; "D C Doval" matches "Dr D C Doval";
 * "Dr U Batra" matches "Ullas Batra". A lone surname on either side is never enough.
 */
export function sameInvestigator(a: string | undefined, b: string | undefined): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  return (ta.length >= 2 && covers(ta, tb)) || (tb.length >= 2 && covers(tb, ta));
}

export interface Investigator {
  name?: string;
  email?: string;
}

/** Why a registry site is listed under this investigator, or null if it isn't. */
export function siteMatchesInvestigator(site: Pick<TrialSite, 'contactName' | 'contactEmail'>, pi: Investigator): 'email' | 'name' | null {
  const email = (pi.email ?? '').trim().toLowerCase();
  if (email && (site.contactEmail ?? '').trim().toLowerCase() === email) return 'email';
  if (pi.name && sameInvestigator(pi.name, site.contactName)) return 'name';
  return null;
}
