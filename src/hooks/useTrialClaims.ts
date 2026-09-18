import { useEffect, useState } from 'react';
import { makeClaimId, subscribeAllClaims } from '../services/trialClaims';
import type { TrialClaim } from '../types';

let cachedClaims: TrialClaim[] = [];
const listeners = new Set<(claims: TrialClaim[]) => void>();
let unsub: (() => void) | null = null;

export function useTrialClaims() {
  const [claims, setClaims] = useState<TrialClaim[]>(cachedClaims);

  useEffect(() => {
    listeners.add(setClaims);
    if (!unsub) {
      unsub = subscribeAllClaims((fresh) => {
        cachedClaims = fresh;
        listeners.forEach((l) => l(fresh));
      });
    }
    return () => {
      listeners.delete(setClaims);
    };
  }, []);

  function getClaim(nctId: string, facility?: string): TrialClaim | undefined {
    if (!facility) {
      return claims.find((c) => c.nctId === nctId);
    }
    const cleanId = makeClaimId(nctId, facility);
    const facLower = facility.toLowerCase().trim();
    return claims.find(
      (c) =>
        c.id === cleanId ||
        (c.nctId === nctId &&
          (c.facility.toLowerCase().trim() === facLower ||
            c.facility.toLowerCase().includes(facLower) ||
            facLower.includes(c.facility.toLowerCase()))),
    );
  }

  return { claims, getClaim };
}
