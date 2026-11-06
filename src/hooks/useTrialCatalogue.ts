import { useEffect, useMemo, useState } from 'react';
import { isSiteClosed } from '../services/closedTrials';
import { subscribePublishedTrials } from '../services/trialSubmissions';
import type { SubmittedTrial, TrialSite } from '../types';
import { useClosedTrials } from './useClosedTrials';
import { useIndiaCancerTrials } from './useIndiaCancerTrials';

/**
 * The combined trial dataset the whole app renders from: live ClinicalTrials.gov rows (cached
 * 6h, unchanged — see useIndiaCancerTrials) plus doctor/coordinator-submitted trials (live via
 * Firestore onSnapshot, so a new submission appears everywhere — public browse/search and the
 * admin Trial catalogue stats — the moment it's published, no cache delay).
 *
 * Sites a Principal Investigator has marked closed (`closedTrials`) are dropped here, so they
 * vanish from every active list at once; they live on in the closed-trial repository.
 */
export function useTrialCatalogue() {
  const api = useIndiaCancerTrials();
  const [submitted, setSubmitted] = useState<SubmittedTrial[]>([]);

  useEffect(() => subscribePublishedTrials(setSubmitted), []);

  const closed = useClosedTrials();

  const rows = useMemo<TrialSite[]>(() => {
    const all = [...api.rows, ...submitted];
    return closed.length ? all.filter((r) => !isSiteClosed(closed, r.nctId, r)) : all;
  }, [api.rows, submitted, closed]);

  return { ...api, rows };
}
