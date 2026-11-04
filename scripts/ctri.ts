import { detectLineOfTherapy, detectMetastatic } from '../src/api/clinicalTrials';
import { classifyCancerType } from '../src/data/cancerTaxonomy';
import { CITIES } from '../src/data/cities';
import type { RegistryTrialDoc } from '../src/types';

/** Minimal RFC 4180 parser: quoted fields, escaped `""`, commas/newlines inside quotes, BOM. */
export function parseCsv(text: string): Record<string, string>[] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      records.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) records.push([...row, field]);
  const [header, ...body] = records;
  return body
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

/** CTRI "Tumour group" → app cancer type, used only when the condition/title keyword classifier
 * finds nothing more specific. Groups that span many cancer types stay "Other cancer". */
const TUMOUR_GROUP_FALLBACK: Record<string, string> = {
  Breast: 'Breast cancer',
  'Lung & thoracic': 'Lung cancer',
  'Head & neck': 'Head & neck cancer',
  CNS: 'Brain tumour',
  'Sarcoma & bone': 'Sarcoma',
};

/** CTRI's "City / state" uses district names; map the common ones onto the city table. */
const CITY_ALIASES: Record<string, string> = {
  bangalore: 'Bengaluru',
  'mumbai (suburban)': 'Mumbai',
  ahmadabad: 'Ahmedabad',
  south: 'Delhi',
  'south west': 'Delhi',
  'north west': 'Delhi',
  east: 'Delhi',
  north: 'Delhi',
  central: 'Delhi',
  kamrup: 'Guwahati',
  khordha: 'Bhubaneswar',
  'dakshina kannada': 'Mangaluru',
  mysore: 'Mysuru',
  'navi mumbai': 'Navi Mumbai',
};

function cityCoords(city: string, state: string): [number, number] | undefined {
  const key = city.toLowerCase();
  // "Raigarh, Maharashtra" is the Kharghar/Navi Mumbai district (ACTREC), not Raigarh, Chhattisgarh.
  const name =
    key === 'raigarh' && /maharashtra/i.test(state) ? 'Navi Mumbai' : CITY_ALIASES[key] ?? Object.keys(CITIES).find((c) => c.toLowerCase() === key);
  return name ? CITIES[name] : undefined;
}

/** "C509- Malignant neoplasm of breast of unspecified site" → "Malignant neoplasm of breast of unspecified site". */
function cleanCondition(c: string): string {
  return c.replace(/^[A-Z]\d[\dA-Z]*(-[A-Z]?\d+)?-\s*/, '').replace(/^null-\s*/, '').trim();
}

function phases(p: string): string[] {
  if (!p || /^n\/?a$/i.test(p)) return [];
  const m = /^phase\s*([\d/]+)$/i.exec(p);
  return m ? m[1].split('/').map((n) => `PHASE${n}`) : [p];
}

const STUDY_TYPE: Record<string, string> = {
  Interventional: 'INTERVENTIONAL',
  Observational: 'OBSERVATIONAL',
  'BA/BE': 'BIOAVAILABILITY / BIOEQUIVALENCE',
  PMS: 'POST-MARKETING SURVEILLANCE',
};

/** "19-10-2026" → "2026-10-19". */
function ddmmyyyy(d: string): string | undefined {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(d);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
}

export function ctriRowToDoc(r: Record<string, string>, syncedAt: string): RegistryTrialDoc {
  const id = r['CTRI number'];
  const conditions = r['Condition']
    .split(/;\s*/)
    .map(cleanCondition)
    .filter((c) => c && c !== '-' && !/^medical and surgical$/i.test(c));
  const titles = [r['Public title'], r['Scientific title']].join(' | ');
  let cancerType = classifyCancerType(conditions, titles);
  if (cancerType === 'Other cancer') cancerType = TUMOUR_GROUP_FALLBACK[r['Tumour group']] ?? cancerType;

  const summary = [
    r['Scientific title'],
    r['Intervention'] && `Intervention: ${r['Intervention']}`,
    r['Primary sponsor'] && `Primary sponsor: ${r['Primary sponsor']}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  const facetText = [titles, r['Intervention']].join(' \n ');

  const [rawCity = '', rawState = ''] = r['City / state'].split(/,\s*/);
  const city = /^\d+$/.test(rawCity) ? '' : rawCity;
  const coords = cityCoords(city, rawState);
  const enrollment = Number.parseInt(r['Target sample size'], 10);

  const site: RegistryTrialDoc['sites'][number] = {
    key: `${id}__0`,
    facility: r['Institution'] || r['Primary sponsor'] || 'Study site',
    city,
    ...(rawState && { state: rawState }),
    ...(coords && { lat: coords[0], lon: coords[1] }),
    ...(r['PI / scientific contact'] && { contactName: r['PI / scientific contact'] }),
    ...(r['PI phone'] && { contactPhone: r['PI phone'] }),
    ...(r['PI email'] && { contactEmail: r['PI email'] }),
  };

  const startDate = ddmmyyyy(r['First enrolment']);
  return {
    registry: 'ctri',
    nctId: id,
    registryUrl: r['CTRI record'],
    briefTitle: r['Public title'],
    conditions,
    cancerType,
    // The CTRI export carries no recruitment status, so don't claim "Recruiting".
    overallStatus: 'REGISTERED',
    phases: phases(r['Phase']),
    metastatic: detectMetastatic(facetText),
    lineOfTherapy: detectLineOfTherapy(facetText),
    briefSummary: summary,
    studyType: STUDY_TYPE[r['Study type']] ?? r['Study type'].toUpperCase(),
    ...(Number.isFinite(enrollment) && { enrollmentCount: enrollment }),
    ...(startDate && { startDate }),
    sites: [site],
    ctri: {
      scientificTitle: r['Scientific title'],
      category: r['Category'],
      primarySponsor: r['Primary sponsor'],
      registeredDate: r['Registered'],
      multinational: r['Multinational'] === 'Yes',
      ...(r['Also on ClinicalTrials.gov'] && { alsoOnCtgov: r['Also on ClinicalTrials.gov'] }),
    },
    syncedAt,
  };
}
