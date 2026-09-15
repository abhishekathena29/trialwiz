// Domain types shared across the public Trial Finder and the internal Demand Intelligence dashboard.

export interface TrialSite {
  /** Composite key: `${nctId}__${facility}__${index}` */
  key: string;
  nctId: string;
  briefTitle: string;
  conditions: string[];
  /** Layman cancer-type bucket, e.g. "Lung cancer" */
  cancerType: string;
  overallStatus: string;
  locationStatus?: string;
  phases: string[];
  facility: string;
  city: string;
  state?: string;
  lat?: number;
  lon?: number;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  lastUpdatePostDate?: string;
  /** Heuristic facets, derived from free-text registry fields — never structured API data. */
  metastatic: 'mentioned' | 'early-stage' | 'unspecified';
  lineOfTherapy: LineOfTherapy;
  eligibilityCriteria?: string;
  briefSummary?: string;
  /** e.g. "INTERVENTIONAL" | "OBSERVATIONAL" */
  studyType?: string;
  enrollmentCount?: number;
  startDate?: string;
  /** Populated client-side once a location/radius scope is active. */
  distanceKm?: number | null;
}

export type LineOfTherapy =
  | 'neoadjuvant'
  | 'adjuvant'
  | 'first-line'
  | 'second-line'
  | 'third-line-plus'
  | 'unspecified';

export interface LocationScope {
  mode: 'none' | 'gps' | 'city';
  coords: [number, number] | null;
  label: string;
}

export interface DemandLogEvent {
  cond: string;
  where: string;
  line: string;
  met: string;
  bio: string;
  resultCount: number;
}

export type UserRole = 'doctor' | 'coordinator';
export type CoordinatorStatus = 'pending' | 'approved' | 'rejected';

/** Profile doc at `users/{uid}` — coexists with that user's `favorites` subcollection.
 * Doctors approve coordinators; only an approved coordinator may submit trials. */
export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: unknown;
  /** Coordinator-only fields. */
  requestedDoctorEmail?: string;
  requestedDoctorName?: string;
  doctorUid?: string | null;
  status?: CoordinatorStatus;
  facility?: string;
  city?: string;
  state?: string;
}

/** A doctor/coordinator-submitted trial — stored at `submittedTrials/{id}` in the exact
 * `TrialSite` shape (its `nctId` is an internal `TW-xxxxxx` id, not a real NCT id) plus
 * bookkeeping, so it merges into the public dataset with zero changes to display code. */
export interface SubmittedTrial extends TrialSite {
  submittedBy: string;
  submittedByName: string;
  doctorUid: string;
  createdAt: unknown;
  listingStatus: 'published' | 'retired';
}
