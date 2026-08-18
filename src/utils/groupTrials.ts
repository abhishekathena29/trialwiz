import type { LineOfTherapy, TrialSite } from '../types';

export interface TrialLocation {
  key: string;
  facility: string;
  city: string;
  state?: string;
  lat?: number;
  lon?: number;
  locationStatus?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  distanceKm?: number | null;
}

export interface GroupedTrial {
  /** = nctId, so a favourite/detail lookup only ever needs one id per study. */
  key: string;
  nctId: string;
  briefTitle: string;
  conditions: string[];
  cancerType: string;
  overallStatus: string;
  phases: string[];
  metastatic: TrialSite['metastatic'];
  lineOfTherapy: LineOfTherapy;
  lastUpdatePostDate?: string;
  studyType?: string;
  enrollmentCount?: number;
  startDate?: string;
  eligibilityCriteria?: string;
  briefSummary?: string;
  /** Nearest-first when distance is known, else registry order. */
  sites: TrialLocation[];
}

/**
 * ClinicalTrials.gov returns one row per India site for a multi-site trial, so the same
 * study can otherwise show up as several near-identical cards. This merges those rows
 * back into one card per NCT ID with every site attached.
 */
export function groupByNctId(rows: TrialSite[]): GroupedTrial[] {
  const byId = new Map<string, GroupedTrial>();

  for (const r of rows) {
    let g = byId.get(r.nctId);
    if (!g) {
      g = {
        key: r.nctId,
        nctId: r.nctId,
        briefTitle: r.briefTitle,
        conditions: r.conditions,
        cancerType: r.cancerType,
        overallStatus: r.overallStatus,
        phases: r.phases,
        metastatic: r.metastatic,
        lineOfTherapy: r.lineOfTherapy,
        lastUpdatePostDate: r.lastUpdatePostDate,
        studyType: r.studyType,
        enrollmentCount: r.enrollmentCount,
        startDate: r.startDate,
        eligibilityCriteria: r.eligibilityCriteria,
        briefSummary: r.briefSummary,
        sites: [],
      };
      byId.set(r.nctId, g);
    }
    g.sites.push({
      key: r.key,
      facility: r.facility,
      city: r.city,
      state: r.state,
      lat: r.lat,
      lon: r.lon,
      locationStatus: r.locationStatus,
      contactName: r.contactName,
      contactPhone: r.contactPhone,
      contactEmail: r.contactEmail,
      distanceKm: r.distanceKm,
    });
  }

  const groups = [...byId.values()];
  for (const g of groups) {
    g.sites.sort((a, b) => (a.distanceKm ?? 9e9) - (b.distanceKm ?? 9e9));
  }
  // Nearest-trial-first overall, same ordering behaviour the flat lists used before grouping.
  groups.sort((a, b) => (a.sites[0]?.distanceKm ?? 9e9) - (b.sites[0]?.distanceKm ?? 9e9));
  return groups;
}
