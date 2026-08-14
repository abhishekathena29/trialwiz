import { collection, getDocs, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { DemandLogEvent } from '../types';
import { DEMAND_LOG_COLLECTION } from './demandLog';
import { USAGE_LOG_COLLECTION, type UsageEventType } from './usageLog';

export interface DemandRecord extends DemandLogEvent {
  id: string;
  createdAt: Date;
}

export async function fetchDemandRecords(sinceMs: number): Promise<DemandRecord[]> {
  if (!db) return [];
  const q = query(collection(db, DEMAND_LOG_COLLECTION), where('createdAt', '>=', Timestamp.fromMillis(sinceMs)));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      cond: data.cond ?? '(unspecified)',
      where: data.where ?? '(unspecified)',
      line: data.line ?? 'any',
      met: data.met ?? 'any',
      bio: data.bio ?? '',
      resultCount: typeof data.resultCount === 'number' ? data.resultCount : 0,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
    };
  });
}

export interface UnmetRow {
  cond: string;
  where: string;
  searches: number;
}

export interface DemandAggregate {
  totalSearches: number;
  distinctCities: number;
  zeroResultPct: number;
  distinctCancerTypes: number;
  byCancer: [string, number][];
  byCity: [string, number][];
  bySetting: [string, number][];
  unmet: UnmetRow[];
}

const LINE_LABELS: Record<string, string> = {
  neoadjuvant: 'Neoadjuvant',
  adjuvant: 'Adjuvant',
  'first-line': '1st line',
  'second-line': '2nd line',
  'third-line-plus': '3rd line+',
  any: 'Unspecified',
};

function topN(counts: Record<string, number>, n: number): [string, number][] {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

export function aggregateDemand(records: DemandRecord[]): DemandAggregate {
  const byCancer: Record<string, number> = {};
  const byCity: Record<string, number> = {};
  const bySetting: Record<string, number> = {};
  const unmetCounts: Record<string, UnmetRow> = {};
  let zeroResults = 0;

  for (const r of records) {
    byCancer[r.cond] = (byCancer[r.cond] || 0) + 1;
    byCity[r.where] = (byCity[r.where] || 0) + 1;
    const setLabel = LINE_LABELS[r.line] ?? 'Unspecified';
    bySetting[setLabel] = (bySetting[setLabel] || 0) + 1;
    if (r.resultCount === 0) {
      zeroResults += 1;
      const key = `${r.cond}__${r.where}`;
      if (!unmetCounts[key]) unmetCounts[key] = { cond: r.cond, where: r.where, searches: 0 };
      unmetCounts[key].searches += 1;
    }
  }

  return {
    totalSearches: records.length,
    distinctCities: new Set(records.map((r) => r.where)).size,
    zeroResultPct: records.length ? Math.round((zeroResults / records.length) * 100) : 0,
    distinctCancerTypes: new Set(records.map((r) => r.cond)).size,
    byCancer: topN(byCancer, 10),
    byCity: topN(byCity, 10),
    bySetting: Object.entries(bySetting).sort((a, b) => b[1] - a[1]),
    unmet: Object.values(unmetCounts).sort((a, b) => b.searches - a.searches),
  };
}

/** k-anonymity guardrail: any cell smaller than 5 is masked so a rare cancer type in a
 * small town can never be traced back to an individual searcher. */
export const K_ANON_THRESHOLD = 5;
export function displayCount(n: number): string {
  return n < K_ANON_THRESHOLD ? '<5' : n.toLocaleString();
}

export interface UsageRecord {
  id: string;
  type: UsageEventType;
  label: string;
  meta: string;
  createdAt: Date;
}

export async function fetchUsageEvents(sinceMs: number): Promise<UsageRecord[]> {
  if (!db) return [];
  const q = query(collection(db, USAGE_LOG_COLLECTION), where('createdAt', '>=', Timestamp.fromMillis(sinceMs)));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      type: (data.type ?? 'click') as UsageEventType,
      label: data.label ?? '(unspecified)',
      meta: data.meta ?? '',
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
    };
  });
}

export interface UsageAggregate {
  totalEvents: number;
  byType: [string, number][];
  topBrowsed: [string, number][];
  topClicked: [string, number][];
  topLocations: [string, number][];
  signups: number;
  signins: number;
  favorites: number;
}

const TYPE_LABELS: Record<UsageEventType, string> = {
  search: 'Searches',
  browse: 'Browse taps',
  location: 'Location changes',
  click: 'Trial-card clicks',
  signup: 'Sign-ups',
  signin: 'Sign-ins',
  favorite: 'Favorite toggles',
};

export function aggregateUsage(records: UsageRecord[]): UsageAggregate {
  const byType: Record<string, number> = {};
  const browsed: Record<string, number> = {};
  const clicked: Record<string, number> = {};
  const locations: Record<string, number> = {};
  let signups = 0;
  let signins = 0;
  let favoritesCount = 0;

  for (const r of records) {
    const typeLabel = TYPE_LABELS[r.type] ?? r.type;
    byType[typeLabel] = (byType[typeLabel] || 0) + 1;
    if (r.type === 'browse') browsed[r.label] = (browsed[r.label] || 0) + 1;
    if (r.type === 'click') clicked[r.label] = (clicked[r.label] || 0) + 1;
    if (r.type === 'location') locations[r.label] = (locations[r.label] || 0) + 1;
    if (r.type === 'signup') signups += 1;
    if (r.type === 'signin') signins += 1;
    if (r.type === 'favorite') favoritesCount += 1;
  }

  return {
    totalEvents: records.length,
    byType: Object.entries(byType).sort((a, b) => b[1] - a[1]),
    topBrowsed: topN(browsed, 10),
    topClicked: topN(clicked, 10),
    topLocations: topN(locations, 10),
    signups,
    signins,
    favorites: favoritesCount,
  };
}
