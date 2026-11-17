import { useEffect, useMemo, useState } from 'react';
import { subscribeAddedSites } from '../services/addedSites';
import { isSiteClosed } from '../services/closedTrials';
import { subscribePublishedTrials } from '../services/trialSubmissions';
import type { AddedSite, SubmittedTrial, TrialSite } from '../types';
import { useClosedTrials } from './useClosedTrials';
import { useIndiaCancerTrials } from './useIndiaCancerTrials';

/**
 * The combined trial dataset the whole app renders from: live ClinicalTrials.gov rows (cached
 * 6h, unchanged — see useIndiaCancerTrials) plus doctor/coordinator-submitted trials (live via
 * Firestore onSnapshot, so a new submission appears everywhere — public browse/search and the
 * admin Trial catalogue stats — the moment it's published, no cache delay).
 *
 * Locations a PI or team member added to an existing study (`addedSites`) are merged in as extra
 * sites of that study — only for studies still in the catalogue, so a location added to a study
 * that later left the registry feed doesn't resurrect it as a one-site trial.
 *
 * Sites a Principal Investigator has marked closed (`closedTrials`) are dropped here, so they
 * vanish from every active list at once; they live on in the closed-trial repository.
 */
export function useTrialCatalogue() {
  const api = useIndiaCancerTrials();
  const [submitted, setSubmitted] = useState<SubmittedTrial[]>([]);

  const [added, setAdded] = useState<AddedSite[]>([]);

  useEffect(() => subscribePublishedTrials(setSubmitted), []);
  useEffect(() => subscribeAddedSites(setAdded), []);

  const closed = useClosedTrials();

  const rows = useMemo<TrialSite[]>(() => {
    const base = [...api.rows, ...submitted];
    const studies = new Set(base.map((r) => r.nctId));
    const all = [...base, ...added.filter((a) => studies.has(a.nctId))];
    return closed.length ? all.filter((r) => !isSiteClosed(closed, r.nctId, r)) : all;
  }, [api.rows, submitted, added, closed]);

  return { ...api, rows };
}
