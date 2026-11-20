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

/** Provider-portal roles. 'doctor' is a Principal Investigator — or a Trial Team Doctor, which is
 * the same account with every PI feature and only a different label (`UserProfile.piTitle`).
 * Coordinators work under a PI, who approves them. Neither is a referring doctor, which is a
 * public Trial Finder account (role 'user', userType 'doctor'). */
export type UserRole = 'doctor' | 'coordinator';
/** Label of a role-'doctor' account. Absent means 'pi'. */
export type PiTitle = 'pi' | 'trialDoctor';
/** Roles that work under a Principal Investigator. */
export type TeamRole = 'coordinator';
export const ROLE_LABEL: Record<string, string> = {
  doctor: 'Principal Investigator',
  coordinator: 'Trial Coordinator',
  trialDoctor: 'Trial Team Doctor',
  user: 'Public account',
  admin: 'Admin',
};

/** Display label for any account — PI vs Trial Team Doctor, referring doctor vs individual. */
export function accountLabel(p: Pick<UserProfile, 'role' | 'piTitle' | 'userType'>): string {
  if (p.role === 'doctor') return p.piTitle === 'trialDoctor' ? ROLE_LABEL.trialDoctor : ROLE_LABEL.doctor;
  if (p.role === 'user') return p.userType === 'doctor' ? 'Referring doctor' : 'Individual';
  return ROLE_LABEL[p.role] ?? p.role;
}
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
  /** Role 'doctor' only: shown as "Trial Team Doctor" instead of "Principal Investigator".
   * Same permissions either way. */
  piTitle?: PiTitle;
  /** Set when admin gave the account a shared initial password (scripts/set-initial-password.ts):
   * the portal makes them choose their own before anything else, then clears it. */
  mustChangePassword?: boolean;
  /** Set on PI accounts created in bulk from a trial registry (see scripts/create-pi-accounts.ts). */
  importedFrom?: 'ctri';
  /** Doctors and PIs: clinical specialization, e.g. "Medical Oncology". */
  specialization?: string;
  /** Hospital / Institution name — used for doctors (Principal Investigators) and coordinators */
  facility?: string;
  city?: string;
  state?: string;
  /** Approval status: 'pending' | 'approved' | 'rejected'.
   * Doctors are approved by Admin; Coordinators are approved by their doctor. */
  status?: ApprovalStatus;
  /** Team-member (coordinator / trial team doctor) fields: the PI they work under. */
  requestedDoctorEmail?: string;
  requestedDoctorName?: string;
  doctorUid?: string | null;
  /** PIs: who verified this account — TrialWiz admin, or an already-verified PI at the same hospital. */
  authorizedByUid?: string;
  authorizedByName?: string;
  authorizedByRole?: 'admin' | 'pi';
  authorizedAt?: unknown;
}

/** One PI authorization event, at `piAuthorizations/{id}` — append-only history of who
 * verified which Principal Investigator, and when. */
export interface PiAuthorization {
  id: string;
  piUid: string;
  piName: string;
  piEmail: string;
  hospital: string;
  /** `hospitalKey(hospital)` — what same-hospital permission checks compare. */
  hospitalKey: string;
  authorizedByUid: string;
  authorizedByName: string;
  authorizedByEmail: string;
  authorizedByRole: 'admin' | 'pi';
  authorizedAt: unknown;
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
  /** Display label of the claimant at claim time, e.g. "Trial Team Doctor". */
  claimedByTitle?: string;
  claimedByEmail: string;
  /** The PI whose team made the claim (the claimant themselves if a PI). Lets the PI, their
   * coordinators and trial team doctors all see — and edit — the team's claims. Absent on older claims. */
  teamPiUid?: string;
  /** Last person to edit the claim, when it wasn't the claimant (a teammate). */
  updatedByName?: string;
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

export type AuditAction =
  | 'trial_closed'
  | 'trial_reopened'
  | 'role_changed'
  | 'pi_authorized'
  | 'team_member_decided'
  | 'account_edited'
  | 'account_deleted';

/** One approve/reject decision on a trial coordinator, at `teamApprovals/{id}` —
 * append-only record of which PI (or admin) approved which team member, and when. */
export interface TeamApproval {
  id: string;
  memberUid: string;
  memberName: string;
  memberEmail: string;
  memberRole: TeamRole;
  decision: 'approved' | 'rejected';
  /** The PI the member works under (for admin-created members, the PI the admin picked). */
  piUid: string;
  piName: string;
  hospital: string;
  decidedByUid: string;
  decidedByName: string;
  decidedByEmail: string;
  decidedByRole: 'admin' | 'pi';
  decidedAt: unknown;
}

/** A location a PI or team member added to an existing trial, at `addedSites/{id}`. Stored in the
 * `TrialSite` shape (study fields copied from the parent study) so it merges into the catalogue
 * as one more site of that study, and can then be claimed like any registry site. */
export interface AddedSite extends TrialSite {
  id: string;
  /** See `TrialClaim.teamPiUid`. */
  teamPiUid?: string;
  addedByUid: string;
  addedByName: string;
  addedByRole: UserRole | 'admin';
  createdAt: unknown;
  updatedAt?: unknown;
}

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
  /** See `TrialClaim.teamPiUid`. Absent on older submissions — `doctorUid` holds the same PI. */
  teamPiUid?: string;
  submittedByName: string;
  doctorUid: string;
  createdAt: unknown;
  listingStatus: 'published' | 'retired';
}
