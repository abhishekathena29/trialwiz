import { classifyCancerType } from '../data/cancerTaxonomy';
import type { LineOfTherapy, TrialSite } from '../types';

const CTG_BASE = 'https://clinicaltrials.gov/api/v2/studies';
const PAGE_SIZE = 100;
const MAX_PAGES = 20; // safety cap: 2,000 studies, far above current India cancer-trial volume

const FIELDS = [
  'NCTId',
  'BriefTitle',
  'Condition',
  'OverallStatus',
  'Phase',
  'LastUpdatePostDate',
  'BriefSummary',
  'EligibilityCriteria',
  'StudyType',
  'EnrollmentCount',
  'StartDateStruct',
  'LocationFacility',
  'LocationCity',
  'LocationState',
  'LocationCountry',
  'LocationStatus',
  'LocationGeoPoint',
  'LocationContactName',
  'LocationContactPhone',
  'LocationContactEMail',
  'CentralContactName',
  'CentralContactPhone',
  'CentralContactEMail',
].join(',');

interface RawContact {
  name?: string;
  phone?: string;
  email?: string;
}

interface RawLocation {
  facility?: string;
  status?: string;
  city?: string;
  state?: string;
  country?: string;
  geoPoint?: { lat: number; lon: number };
  contacts?: RawContact[];
}

interface RawStudy {
  protocolSection: {
    identificationModule: { nctId: string; briefTitle: string };
    statusModule?: { overallStatus?: string; lastUpdatePostDateStruct?: { date?: string }; startDateStruct?: { date?: string } };
    conditionsModule?: { conditions?: string[] };
    designModule?: { phases?: string[]; studyType?: string; enrollmentInfo?: { count?: number } };
    descriptionModule?: { briefSummary?: string };
    eligibilityModule?: { eligibilityCriteria?: string };
    contactsLocationsModule?: {
      centralContacts?: RawContact[];
      locations?: RawLocation[];
    };
  };
}

interface RawResponse {
  studies: RawStudy[];
  nextPageToken?: string;
}

function detectMetastatic(text: string): TrialSite['metastatic'] {
  if (/\bmetastat|stage\s*iv\b|advanced disease|recurrent\/metastatic/i.test(text)) return 'mentioned';
  if (/\bearly[- ]stage|locali[sz]ed|resectable|non[- ]metastatic|stage\s*i(?![iv])/i.test(text))
    return 'early-stage';
  return 'unspecified';
}

function detectLineOfTherapy(text: string): LineOfTherapy {
  if (/neoadjuvant/i.test(text)) return 'neoadjuvant';
  if (/adjuvant/i.test(text)) return 'adjuvant';
  if (/third[- ]line|3rd[- ]line|\b3l\b|refractory|relapsed\/refractory/i.test(text)) return 'third-line-plus';
  if (/second[- ]line|2nd[- ]line|\b2l\b/i.test(text)) return 'second-line';
  if (/first[- ]line|1st[- ]line|\b1l\b|treatment[- ]na(i|ï)ve/i.test(text)) return 'first-line';
  return 'unspecified';
}

function pickContact(location: RawLocation, central: RawContact[] | undefined) {
  const fromLocation = location.contacts?.find((c) => c.phone || c.email) ?? location.contacts?.[0];
  if (fromLocation) return fromLocation;
  return central?.find((c) => c.phone || c.email) ?? central?.[0];
}

function flattenStudy(study: RawStudy): TrialSite[] {
  const { identificationModule, statusModule, conditionsModule, designModule, descriptionModule, eligibilityModule, contactsLocationsModule } =
    study.protocolSection;

  const conditions = conditionsModule?.conditions ?? [];
  const briefTitle = identificationModule.briefTitle;
  const cancerType = classifyCancerType(conditions, briefTitle);
  const eligibilityCriteria = eligibilityModule?.eligibilityCriteria ?? '';
  const briefSummary = descriptionModule?.briefSummary ?? '';
  const facetText = [briefTitle, briefSummary, eligibilityCriteria].join(' \n ');

  const indiaLocations = (contactsLocationsModule?.locations ?? []).filter((l) => l.country === 'India');
  if (indiaLocations.length === 0) return [];

  return indiaLocations.map((loc, idx) => {
    const contact = pickContact(loc, contactsLocationsModule?.centralContacts);
    return {
      key: `${identificationModule.nctId}__${idx}`,
      nctId: identificationModule.nctId,
      briefTitle,
      conditions,
      cancerType,
      overallStatus: statusModule?.overallStatus ?? 'UNKNOWN',
      locationStatus: loc.status,
      phases: designModule?.phases ?? [],
      facility: loc.facility ?? 'Study site',
      city: loc.city ?? '',
      state: loc.state,
      lat: loc.geoPoint?.lat,
      lon: loc.geoPoint?.lon,
      contactName: contact?.name,
      contactPhone: contact?.phone,
      contactEmail: contact?.email,
      lastUpdatePostDate: statusModule?.lastUpdatePostDateStruct?.date,
      metastatic: detectMetastatic(facetText),
      lineOfTherapy: detectLineOfTherapy(facetText),
      studyType: designModule?.studyType,
      enrollmentCount: designModule?.enrollmentInfo?.count,
      startDate: statusModule?.startDateStruct?.date,
      eligibilityCriteria,
      briefSummary,
    };
  });
}

/**
 * Fetches every RECRUITING oncology trial registered on ClinicalTrials.gov with at least
 * one site in India, paginating until exhausted. Returns one flattened row per India site
 * (a multi-site trial contributes multiple rows), mirroring how the UI browses "by centre".
 */
export async function fetchIndiaCancerTrials(): Promise<TrialSite[]> {
  const rows: TrialSite[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  do {
    const params = new URLSearchParams({
      'query.cond': 'cancer',
      'filter.overallStatus': 'RECRUITING',
      'filter.advanced': 'AREA[LocationCountry]India',
      pageSize: String(PAGE_SIZE),
      fields: FIELDS,
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`${CTG_BASE}?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`ClinicalTrials.gov API error: ${res.status} ${res.statusText}`);
    }
    const data: RawResponse = await res.json();
    for (const study of data.studies) rows.push(...flattenStudy(study));

    pageToken = data.nextPageToken;
    pages += 1;
  } while (pageToken && pages < MAX_PAGES);

  return rows;
}
