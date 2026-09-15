import type { TrialSite } from '../types';
import { centreKey } from './format';

/** Shared "how many trials of X" counters — used by the public Browse views and the admin
 * Trial catalogue card, so both always agree. Counts distinct nctIds, not raw site rows: a
 * trial with several India sites tallies once, matching the rest of the app's convention. */

export function tallyByCancerType(rows: TrialSite[]): Record<string, number> {
  const seen: Record<string, Set<string>> = {};
  for (const r of rows) (seen[r.cancerType] ??= new Set()).add(r.nctId);
  const out: Record<string, number> = {};
  for (const [k, ids] of Object.entries(seen)) out[k] = ids.size;
  return out;
}

export function countUniqueTrials(rows: TrialSite[]): number {
  return new Set(rows.map((r) => r.nctId)).size;
}

export interface CentreTally {
  key: string;
  facility: string;
  city: string;
  count: number;
}

export function tallyByCentre(rows: TrialSite[]): CentreTally[] {
  const seen: Record<string, Set<string>> = {};
  const info: Record<string, { facility: string; city: string }> = {};
  for (const r of rows) {
    const key = centreKey(r.facility, r.city);
    (seen[key] ??= new Set()).add(r.nctId);
    info[key] ??= { facility: r.facility, city: r.city };
  }
  return Object.entries(seen)
    .map(([key, ids]) => ({ key, ...info[key], count: ids.size }))
    .sort((a, b) => b.count - a.count);
}
