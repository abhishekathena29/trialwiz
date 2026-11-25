import { CITIES } from '../data/cities';
import { REGIONS } from '../data/regions';
import { words } from './format';

/** Joining words that never carry identity and are skipped when forming an acronym. */
const STOPWORDS = new Set(['of', 'and', 'the', 'for', 'at', 'in', 'a', '&']);

/** Words that describe *what kind* of place a hospital is rather than *which* one. Narrower than
 * `centreKey`'s list on purpose: "memorial", "medical", "cancer" stay distinctive here, so
 * "Tata Memorial" doesn't also return Tata Medical Center, Kolkata. */
const GENERIC = new Set([
  'hospital', 'hospitals', 'centre', 'center', 'institute', 'institution', 'research', 'clinic', 'clinics',
  'trust', 'foundation', 'department', 'dept', 'unit', 'site', 'branch', 'block', 'ward', 'ltd', 'pvt',
]);

/** Direction / "new" words that only make sense next to a place name ("New Delhi", "South Delhi"). */
const PLACE_MODIFIERS = new Set(['new', 'navi', 'north', 'south', 'east', 'west', 'central', 'india']);

/** Every word of a known city or state name. A query word in this set is a location, which is
 * matched against the site's city/state as well as its name. */
const PLACE_WORDS = new Set(
  [...Object.keys(CITIES), ...Object.values(REGIONS).flat(), 'Bangalore', 'Bombay', 'Madras', 'Calcutta', 'Gurgaon']
    .flatMap((n) => words(n))
    // Stopwords too: "and" from "Andaman and Nicobar Islands" made every "… and Research Centre"
    // query demand a literal "and", so sites spelled with "&" never matched.
    .filter((w) => !PLACE_MODIFIERS.has(w) && !GENERIC.has(w) && !STOPWORDS.has(w)),
);

/** Initials of a name, skipping joining words: "All India Institute of Medical Sciences" → "aiims",
 * "Rajiv Gandhi Cancer Institute" → "rgci". Only produced for names of 2+ words. */
function acronym(tokens: string[]): string {
  const w = tokens.filter((t) => !STOPWORDS.has(t));
  return w.length >= 2 ? w.map((t) => t[0]).join('') : '';
}

export interface HospitalMatcher {
  /** True when nothing distinctive was typed — every row matches. */
  empty: boolean;
  matches: (facility: string | undefined, city?: string, state?: string) => boolean;
}

/**
 * Builds a matcher for the portal's "hospital name" filter.
 *
 * - Every distinctive word typed must match the site's name — as a whole word, as a 4+ letter
 *   prefix (so partial typing works), or as the site name's acronym ("AIIMS" ↔ "All India
 *   Institute of Medical Sciences", "RGCI" ↔ "Rajiv Gandhi Cancer Institute…").
 * - Generic words ("hospital", "institute", "centre") are ignored unless they're all that was typed.
 * - City/state words ("AIIMS New Delhi", "AIIMS Jodhpur") must match the site's name, city or
 *   state — at least one of them — so AIIMS Jodhpur doesn't return AIIMS New Delhi, while
 *   registry cities like "South, Delhi" still count as Delhi.
 * - A site with no facility name never matches.
 *
 * Replaces a substring match that let any shared word ("institute", "medical", "india") pull in
 * unrelated hospitals such as Tata Memorial for an AIIMS search, and matched blank facilities.
 */
export function hospitalMatcher(query: string): HospitalMatcher {
  const all = words(query);
  // A place word, or a modifier directly in front of one ("New" in "New Delhi") — but not "India"
  // in "All India Institute…", which is part of the name.
  const isPlace = (w: string, i: number) =>
    PLACE_WORDS.has(w) || (PLACE_MODIFIERS.has(w) && PLACE_WORDS.has(all[i + 1] ?? ''));
  const places = all.filter((w) => PLACE_WORDS.has(w));
  // Only the name before the first "(" or "," must match: profile names like "Rajiv Gandhi Cancer
  // Institute and Research Centre (RGCIRC) Rohini" add an acronym and a locality that registry
  // sites rarely repeat, and requiring them hid almost every trial at that hospital.
  const leadAll = words(query.split(/[(,]/)[0]);
  const leadIsName = leadAll.some((w, i) => !isPlace(w, i) && !STOPWORDS.has(w) && !GENERIC.has(w));
  const nameSource = leadIsName ? leadAll : all;
  const nameOnly = nameSource.filter((w, i) => !isPlace(w, i));
  const nonPlace = nameOnly.filter((w) => !STOPWORDS.has(w));
  const significant = nonPlace.filter((w) => !GENERIC.has(w));
  const identity = significant.length > 0 ? significant : nonPlace;
  if (identity.length === 0 && places.length === 0) return { empty: true, matches: () => true };
  // "All India Institute of Medical Sciences" typed in full should also find a site listed as "AIIMS".
  const fullQueryAcronym = acronym(nameOnly);
  const queryAcronym = fullQueryAcronym.length >= 3 ? fullQueryAcronym : '';

  return {
    empty: false,
    matches(facility, city, state) {
      const facTokens = words(facility ?? '');
      if (facTokens.length === 0) return false;
      const nameWords = new Set(facTokens);
      const acronyms = new Set<string>();
      const whole = acronym(facTokens);
      if (whole) acronyms.add(whole);
      // Also the part before the first comma/dash/paren: "AIIMS, Dept of Oncology" vs
      // "All India Institute of Medical Sciences - New Delhi".
      const lead = acronym(words((facility ?? '').split(/[,\-([/]/)[0]));
      if (lead) acronyms.add(lead);

      const nameHit = (t: string) =>
        nameWords.has(t) ||
        // "RGCI" for "Rajiv Gandhi Cancer Institute and Research Centre" (acronym "rgcirc").
        [...acronyms].some((a) => a === t || (t.length >= 3 && a.startsWith(t))) ||
        (t.length >= 4 && facTokens.some((h) => h.startsWith(t)));

      const identityOk =
        identity.length === 0 ||
        identity.every(nameHit) ||
        (queryAcronym !== '' && facTokens.some((w) => !STOPWORDS.has(w) && w === queryAcronym));
      if (!identityOk) return false;

      if (places.length === 0) return true;
      const where = new Set([...facTokens, ...words(city ?? ''), ...words(state ?? '')]);
      return places.some((p) => where.has(p));
    },
  };
}
