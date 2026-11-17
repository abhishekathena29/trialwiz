import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { CITIES, matchCity } from '../data/cities';
import { db } from '../firebase';
import type { AddedSite, UserProfile } from '../types';
import type { GroupedTrial } from '../utils/groupTrials';

export const ADDED_SITES_COLLECTION = 'addedSites';

function requireDb() {
  if (!db) throw new Error('Firebase is not configured — see README.md.');
  return db;
}

function stripUndefined<T extends object>(obj: T): T {
  const out = {} as T;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export interface SiteFields {
  facility: string;
  city: string;
  state?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
}

function locationFields(f: SiteFields) {
  const coords = CITIES[matchCity(f.city.trim())];
  return {
    facility: f.facility.trim(),
    city: f.city.trim(),
    state: f.state?.trim() || undefined,
    lat: coords?.[0],
    lon: coords?.[1],
    contactName: f.contactName?.trim() || undefined,
    contactPhone: f.contactPhone?.trim() || undefined,
    contactEmail: f.contactEmail?.trim() || undefined,
  };
}

/** The PI a provider works for — themselves if they're a PI. Stored on claims and added sites so
 * the whole team (PI, coordinators, trial team doctors) can recognise and edit each other's work. */
export function teamPiUidOf(profile: UserProfile): string | undefined {
  if (profile.role === 'doctor') return profile.uid;
  return profile.doctorUid ?? undefined;
}

/**
 * Adds a new location to an existing study (registry or submitted). The study-level fields are
 * copied from the study so the row merges into the catalogue as one more site of that study —
 * it then shows on the public Trial Finder and can be claimed like any registry site.
 */
export async function addSiteToTrial(study: GroupedTrial, fields: SiteFields, by: UserProfile): Promise<void> {
  const firestore = requireDb();
  const ref = doc(collection(firestore, ADDED_SITES_COLLECTION));
  const site: Omit<AddedSite, 'createdAt'> & { createdAt: unknown; teamPiUid?: string } = {
    id: ref.id,
    key: `${study.nctId}__added__${ref.id}`,
    nctId: study.nctId,
    briefTitle: study.briefTitle,
    conditions: study.conditions ?? [],
    cancerType: study.cancerType,
    overallStatus: study.overallStatus,
    phases: study.phases ?? [],
    metastatic: study.metastatic,
    lineOfTherapy: study.lineOfTherapy,
    lastUpdatePostDate: new Date().toISOString().slice(0, 10),
    studyType: study.studyType,
    enrollmentCount: study.enrollmentCount,
    startDate: study.startDate,
    eligibilityCriteria: study.eligibilityCriteria,
    briefSummary: study.briefSummary,
    registry: study.registry,
    registryUrl: study.registryUrl,
    locationStatus: 'RECRUITING',
    ...locationFields(fields),
    addedByUid: by.uid,
    addedByName: by.name,
    addedByRole: by.role === 'doctor' || by.role === 'coordinator' ? by.role : 'admin',
    teamPiUid: teamPiUidOf(by),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, stripUndefined(site));
}

/** Changes an added location's name/address/contact. Blank optional fields are cleared. */
export async function updateAddedSite(id: string, fields: SiteFields): Promise<void> {
  const firestore = requireDb();
  const loc = locationFields(fields);
  await updateDoc(doc(firestore, ADDED_SITES_COLLECTION, id), {
    ...loc,
    state: loc.state ?? '',
    lat: loc.lat ?? null,
    lon: loc.lon ?? null,
    contactName: loc.contactName ?? '',
    contactPhone: loc.contactPhone ?? '',
    contactEmail: loc.contactEmail ?? '',
    updatedAt: serverTimestamp(),
  });
}

export async function removeAddedSite(id: string): Promise<void> {
  await deleteDoc(doc(requireDb(), ADDED_SITES_COLLECTION, id));
}

/** Every added location — publicly readable, merged into the catalogue. */
export function subscribeAddedSites(onChange: (sites: AddedSite[]) => void): () => void {
  if (!db) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    collection(db, ADDED_SITES_COLLECTION),
    (snap) =>
      onChange(
        snap.docs.map((d) => {
          const s = d.data() as AddedSite;
          // Cleared coordinates are stored as null; TrialSite expects undefined.
          return { ...s, lat: s.lat ?? undefined, lon: s.lon ?? undefined };
        }),
      ),
    (err) => {
      console.warn('[TrialWiz] added sites subscription failed:', err);
      onChange([]);
    },
  );
}
