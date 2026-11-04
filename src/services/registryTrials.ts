import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import type { RegistryTrialDoc, TrialSite } from '../types';
import { expandRegistryTrial } from '../utils/registryDocs';

export const REGISTRY_TRIALS_COLLECTION = 'registryTrials';

/** CTRI rows the export itself flags as not oncology questions (anaesthesia technique,
 * pneumonia QoL, etc.). Kept in Firestore for completeness, not shown to patients. */
const HIDDEN_CTRI_CATEGORIES = new Set(['Peripheral (not an oncology question)']);

/** Every registry study synced into Firestore by `scripts/seed-registry.ts`, flattened to one
 * row per site. Empty (not an error) when Firebase isn't configured. */
export async function fetchRegistryTrials(): Promise<TrialSite[]> {
  if (!db) return [];
  const snap = await getDocs(collection(db, REGISTRY_TRIALS_COLLECTION));
  return snap.docs
    .map((d) => d.data() as RegistryTrialDoc)
    .filter((d) => !(d.ctri?.category && HIDDEN_CTRI_CATEGORIES.has(d.ctri.category)))
    .flatMap(expandRegistryTrial);
}
