import { useCallback, useEffect, useState } from 'react';
import { fetchIndiaCancerTrials } from '../api/clinicalTrials';
import type { TrialSite } from '../types';

const CACHE_KEY = 'trialwiz_india_cancer_trials_v1';
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — mirrors the "refreshes nightly" sync model, without needing a server

interface Cache {
  fetchedAt: number;
  rows: TrialSite[];
}

function readCache(): Cache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Cache;
  } catch {
    return null;
  }
}

function writeCache(rows: TrialSite[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), rows }));
  } catch {
    // localStorage unavailable (private mode, quota) — non-fatal, just skip caching
  }
}

export function useIndiaCancerTrials() {
  const [rows, setRows] = useState<TrialSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  const load = useCallback(async (force = false) => {
    await Promise.resolve(); // yield first so effect-triggered calls never setState synchronously
    if (!force) {
      const cached = readCache();
      if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
        setRows(cached.rows);
        setFetchedAt(cached.fetchedAt);
        setLoading(false);
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const fresh = await fetchIndiaCancerTrials();
      writeCache(fresh);
      setRows(fresh);
      setFetchedAt(Date.now());
    } catch (e) {
      const cached = readCache();
      if (cached) {
        setRows(cached.rows);
        setFetchedAt(cached.fetchedAt);
        setError('Could not refresh from ClinicalTrials.gov — showing the last successful sync.');
      } else {
        setError(e instanceof Error ? e.message : 'Could not reach ClinicalTrials.gov.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    (async () => {
      await Promise.resolve();
      if (!ignore) await load();
    })();
    return () => {
      ignore = true;
    };
  }, [load]);

  return { rows, loading, error, fetchedAt, refetch: () => load(true) };
}
