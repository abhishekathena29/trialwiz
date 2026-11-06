// Domain types shared across the public Trial Finder and the internal Demand Intelligence dashboard.

export interface TrialSite {
  /** Composite key: `${nctId}__${facility}__${index}` */
  key: string;
  nctId: string;
  briefTitle: string;
  conditions: string[];
  /** Layman cancer-type bucket, e.g. "Lung cancer" */
  cancerType: string;
  /** Category grouping: solid organ, haematology, or pediatric oncology */
  cancerCategory?: 'solid' | 'blood' | 'pediatric';
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
  principalInvestigatorPhone?: string;
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
  /** Which public registry the record came from. Absent on hospital-submitted trials. */
  registry?: 'ctgov' | 'ctri';
  /** Link to the registry record (CTRI ids aren't URL-derivable like NCT ids are). */
  registryUrl?: string;
}

/** One study at `registryTrials/{docId}`, written by `scripts/seed-registry.ts`. Study-level
 * fields are stored once and per-site fields in `sites`, so a multi-site trial is one doc
 * read rather than one per site; `expandRegistryTrial` turns it back into `TrialSite` rows. */
export interface RegistryTrialDoc
  extends Omit<TrialSite, 'key' | 'facility' | 'city' | 'state' | 'lat' | 'lon' | 'locationStatus' | 'contactName' | 'contactPhone' | 'contactEmail' | 'principalInvestigatorPhone' | 'distanceKm'> {
  registry: 'ctgov' | 'ctri';
  sites: Array<
    Pick<TrialSite, 'key' | 'facility' | 'city' | 'state' | 'lat' | 'lon' | 'locationStatus' | 'contactName' | 'contactPhone' | 'contactEmail'>
  >;
  /** CTRI-only context that has no `TrialSite` equivalent. */
  ctri?: {
    scientificTitle?: string;
    category?: string;
    primarySponsor?: string;
    registeredDate?: string;
    multinational?: boolean;
    alsoOnCtgov?: string;
  };
  /** Set on a ClinicalTrials.gov study that is also registered on CTRI. */
  ctriNumber?: string;
  syncedAt: string;
}

export type CancerCategory = 'solid' | 'blood' | 'pediatric';

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
/** Every signed-in account gets a `users/{uid}` doc: public Trial Finder accounts are 'user',
 * owner dashboard accounts are 'admin', provider-portal accounts are a `UserRole`. */
export type AccountRole = UserRole | 'user' | 'admin';
/** Sub-type of a public (role 'user') account — chosen on the unified login page. */
export type PublicUserType = 'individual' | 'doctor';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type CoordinatorStatus = ApprovalStatus;

/** Profile doc at `users/{uid}` — coexists with that user's `favorites` subcollection.
 * Admins approve doctors; doctors approve coordinators. */
export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: AccountRole;
  createdAt: unknown;
  lastLoginAt?: unknown;
  /** Firebase Auth provider of the first sign-in, e.g. "password". */
  signInProvider?: string;
  /** Public Trial Finder accounts only: who the person said they are at sign-up. */
  userType?: PublicUserType;
  /** Hospital / Institution name — used for doctors (Principal Investigators) and coordinators */
  facility?: string;
  city?: string;
  state?: string;
  /** Approval status: 'pending' | 'approved' | 'rejected'.
   * Doctors are approved by Admin; Coordinators are approved by their doctor. */
  status?: ApprovalStatus;
  /** Coordinator-only fields. */
  requestedDoctorEmail?: string;
  requestedDoctorName?: string;
  doctorUid?: string | null;
}

/** Record of a Principal Investigator or Coordinator claiming a trial at their site.
 * Stored in `trialClaims/{claimId}`. */
export interface TrialClaim {
  id: string;
  nctId: string;
  /** The registry site (location) being claimed — one NCT ID can run at many sites. */
  facility: string;
  city?: string;
  state?: string;
  /** Hospital the claiming PI/coordinator is registered with (from their profile). */
  hospitalName?: string;
  briefTitle?: string;
  cancerType?: string;
  claimedByUid: string;
  claimedByName: string;
  claimedByRole: UserRole;
  claimedByEmail: string;
  /** Public contact phone/email. Empty when the PI chose to keep that field personal — the
   * personal value then lives in `claimPrivateContacts/{claimId}`, readable only by its owner. */
  contactPhone: string;
  contactEmail: string;
  contactName: string;
  phoneVisibility?: ContactVisibility;
  emailVisibility?: ContactVisibility;
  department?: string;
  notes?: string;
  confirmedPrincipalInvestigator: boolean;
  claimedAt: unknown;
  updatedAt: unknown;
}

/** Contact phone for an account, at `userContacts/{uid}` — kept out of `users/{uid}` because
 * PI profiles are publicly readable. Readable only by the owner and admins. */
export interface UserContact {
  uid: string;
  /** Private phone — only the account owner and admins ever see it. */
  phone?: string;
  /** PIs and doctors only: the number they want shown publicly — it's the default contact
   * phone on trials a PI claims. */
  publicPhone?: string;
  updatedAt?: unknown;
}

export type ContactVisibility = 'public' | 'personal';

/** Owner-only contact details for a claim, at `claimPrivateContacts/{claimId}`. */
export interface ClaimPrivateContact {
  claimId: string;
  ownerUid: string;
  contactPhone?: string;
  contactEmail?: string;
  updatedAt: unknown;
}

/** A trial site a Principal Investigator has marked closed — the "repository". Stored at
 * `closedTrials/{claimId}`; any catalogue row matching it is hidden from active lists. */
export interface ClosedTrial {
  id: string;
  claimId: string;
  nctId: string;
  facility: string;
  city?: string;
  state?: string;
  hospitalName?: string;
  briefTitle?: string;
  cancerType?: string;
  reason?: string;
  closedByUid: string;
  closedByName: string;
  closedByEmail: string;
  closedAt: unknown;
}

export type AuditAction = 'trial_closed' | 'trial_reopened' | 'role_changed';

/** Append-only audit trail at `auditLog/{id}` — readable by admins only. */
export interface AuditEntry {
  id: string;
  action: AuditAction;
  actorUid: string;
  actorEmail: string;
  actorName?: string;
  /** Human-readable subject, e.g. an NCT id + site, or the user whose role changed. */
  target: string;
  details?: string;
  at: unknown;
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
