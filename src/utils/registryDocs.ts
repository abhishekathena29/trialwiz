import type { RegistryTrialDoc, TrialSite } from '../types';

/** Firestore doc ids can't contain `/`, and CTRI numbers do (`CTRI/2026/10/119100`). The same
 * encoding is used anywhere a trial id becomes a doc id (favorites, claims). */
export function trialDocId(nctId: string): string {
  return nctId.replace(/\//g, '-');
}

const SITE_FIELDS = ['key', 'facility', 'city', 'state', 'lat', 'lon', 'locationStatus', 'contactName', 'contactPhone', 'contactEmail'] as const;

/** Firestore rejects `undefined` values — drop those keys before writing. */
function compact<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/** Collapses per-site `TrialSite` rows (as the ClinicalTrials.gov mapper emits them) into one doc
 * per study. Assumes every row for a given nctId shares the same study-level fields. */
export function rowsToRegistryDocs(rows: TrialSite[], syncedAt: string): RegistryTrialDoc[] {
  const byId = new Map<string, RegistryTrialDoc>();
  for (const row of rows) {
    let d = byId.get(row.nctId);
    if (!d) {
      const study: Record<string, unknown> = { ...row };
      for (const f of [...SITE_FIELDS, 'principalInvestigatorPhone', 'distanceKm']) delete study[f];
      d = compact({ ...(study as Omit<RegistryTrialDoc, 'sites' | 'syncedAt' | 'registry'>), registry: row.registry ?? 'ctgov', sites: [], syncedAt });
      byId.set(row.nctId, d);
    }
    d.sites.push(compact(Object.fromEntries(SITE_FIELDS.map((f) => [f, row[f]])) as RegistryTrialDoc['sites'][number]));
  }
  return [...byId.values()];
}

export function expandRegistryTrial(d: RegistryTrialDoc): TrialSite[] {
  const study: Record<string, unknown> = { ...d };
  for (const f of ['sites', 'ctri', 'ctriNumber', 'syncedAt']) delete study[f];
  return d.sites.map((s) => ({ ...(study as Omit<TrialSite, keyof typeof s>), ...s }));
}
