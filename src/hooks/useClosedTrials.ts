import { useEffect, useState } from 'react';
import { subscribeClosedTrials } from '../services/closedTrials';
import type { ClosedTrial } from '../types';

// One shared Firestore listener for every component that needs the closed-trial repository.
let cached: ClosedTrial[] = [];
const listeners = new Set<(closed: ClosedTrial[]) => void>();
let unsub: (() => void) | null = null;

export function useClosedTrials(): ClosedTrial[] {
  const [closed, setClosed] = useState<ClosedTrial[]>(cached);

  useEffect(() => {
    listeners.add(setClosed);
    if (!unsub) {
      unsub = subscribeClosedTrials((fresh) => {
        cached = fresh;
        listeners.forEach((l) => l(fresh));
      });
    }
    return () => {
      listeners.delete(setClosed);
    };
  }, []);

  return closed;
}
