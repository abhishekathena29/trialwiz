// Zonal grouping of Indian states/UTs into the four browse regions shown in the UI.
// This mirrors common informal usage (not the official 6-zone Zonal Council split) so every
// state/UT lands in exactly one of North/South/East/West, matching what patients expect.

export const REGIONS: Record<string, string[]> = {
  'North India': [
    'Delhi',
    'Haryana',
    'Punjab',
    'Himachal Pradesh',
    'Uttarakhand',
    'Uttar Pradesh',
    'Rajasthan',
    'Jammu and Kashmir',
    'Ladakh',
    'Chandigarh',
  ],
  'South India': [
    'Karnataka',
    'Kerala',
    'Tamil Nadu',
    'Andhra Pradesh',
    'Telangana',
    'Puducherry',
    'Andaman and Nicobar Islands',
    'Lakshadweep',
  ],
  'East India': [
    'West Bengal',
    'Odisha',
    'Bihar',
    'Jharkhand',
    'Assam',
    'Sikkim',
    'Arunachal Pradesh',
    'Manipur',
    'Meghalaya',
    'Mizoram',
    'Nagaland',
    'Tripura',
  ],
  'West India': ['Maharashtra', 'Gujarat', 'Goa', 'Madhya Pradesh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu'],
};

export const REGION_NAMES = Object.keys(REGIONS);

const STATE_REGION: Record<string, string> = {};
for (const [region, states] of Object.entries(REGIONS)) {
  for (const s of states) STATE_REGION[s] = region;
}

/** ClinicalTrials.gov `LocationState` free text has a handful of spelling variants for India. */
const ALIASES: Record<string, string> = {
  orissa: 'Odisha',
  pondicherry: 'Puducherry',
  uttaranchal: 'Uttarakhand',
  'jammu & kashmir': 'Jammu and Kashmir',
  'j&k': 'Jammu and Kashmir',
  'nct of delhi': 'Delhi',
  'national capital territory of delhi': 'Delhi',
  'new delhi': 'Delhi',
  'andaman & nicobar islands': 'Andaman and Nicobar Islands',
  'andaman and nicobar': 'Andaman and Nicobar Islands',
  'dadra and nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu',
  'daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
};

/** Normalises a raw registry state string to one of our canonical state/UT names, or '' if unrecognised. */
export function normalizeState(raw: string | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (ALIASES[lower]) return ALIASES[lower];
  const canonical = Object.keys(STATE_REGION).find((s) => s.toLowerCase() === lower);
  return canonical ?? trimmed;
}

export function regionOf(rawState: string | undefined): string | undefined {
  const state = normalizeState(rawState);
  return state ? STATE_REGION[state] : undefined;
}
