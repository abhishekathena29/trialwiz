import { useEffect, useMemo, useState } from 'react';
import { subscribePublishedTrials } from '../services/trialSubmissions';
import type { SubmittedTrial, TrialSite } from '../types';
import { useIndiaCancerTrials } from './useIndiaCancerTrials';

/**
 * The combined trial dataset the whole app renders from: live ClinicalTrials.gov rows (cached
 * 6h, unchanged — see useIndiaCancerTrials) plus doctor/coordinator-submitted trials (live via
 * Firestore onSnapshot, so a new submission appears everywhere — public browse/search and the
 * admin Trial catalogue stats — the moment it's published, no cache delay).
 */
export function useTrialCatalogue() {
  const api = useIndiaCancerTrials();
  const [submitted, setSubmitted] = useState<SubmittedTrial[]>([]);

  useEffect(() => subscribePublishedTrials(setSubmitted), []);

  const rows = useMemo<TrialSite[]>(() => [...api.rows, ...submitted], [api.rows, submitted]);

  return { ...api, rows };
}
