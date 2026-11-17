import { signOut, type User } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';
import { CANCERS } from '../../data/cancerTaxonomy';
import { auth } from '../../firebase';
import { useClosedTrials } from '../../hooks/useClosedTrials';
import { useTrialCatalogue } from '../../hooks/useTrialCatalogue';
import { EditAccountModal } from '../../components/EditAccountModal';
import { addSiteToTrial, removeAddedSite, subscribeAddedSites, teamPiUidOf, updateAddedSite } from '../../services/addedSites';
import { reopenTrial } from '../../services/closedTrials';
import { subscribeHospitalPis } from '../../services/piAuthorization';
import { subscribeTeamForPi, subscribeUserContact } from '../../services/profiles';
import { decideTeamMember, subscribePiTeamApprovals } from '../../services/teamApprovals';
import { claimMatchesSite, subscribeAllClaims, subscribeMyPrivateContacts } from '../../services/trialClaims';
import {
  ROLE_LABEL,
  type AddedSite,
  type ClaimPrivateContact,
  type ClosedTrial,
  type TeamApproval,
  type TrialClaim,
  type UserProfile,
} from '../../types';
import { formatTimestamp, timestampMs } from '../../utils/timestamps';
import { groupByNctId, type GroupedTrial, type TrialLocation } from '../../utils/groupTrials';
import { hospitalMatcher } from '../../utils/hospitalMatch';
import { SiteFormModal } from './SiteFormModal';
import { AddTrialForm } from './AddTrialForm';
import { ClaimTrialModal } from './ClaimTrialModal';
import { CloseTrialModal } from './CloseTrialModal';
import { HospitalPisSection } from './HospitalPisSection';
import { MySubmittedTrials } from './MySubmittedTrials';
import { PortalHeader } from './PortalHeader';
import './Portal.css';

function RequestRow({
  coordinator,
  onApprove,
  onReject,
  busy,
}: {
  coordinator: UserProfile;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  return (
    <div className="reqrow">
      <div className="reqinfo">
        <b>
          {coordinator.name} <span className="pill">{ROLE_LABEL[coordinator.role] ?? coordinator.role}</span>
        </b>
        <span>
          {coordinator.email} · {coordinator.facility}, {coordinator.city}
          {coordinator.specialization && ` · ${coordinator.specialization}`}
        </span>
      </div>
      <div className="reqactions">
        <button className="btn primary" onClick={onApprove} disabled={busy}>
          Approve
        </button>
        <button className="btn" onClick={onReject} disabled={busy}>
          Reject
        </button>
      </div>
    </div>
  );
}

/** Location + registered hospital + published contact details for one claim. Personal
 * (non-public) phone/email only appear for the claim's owner, tagged as such. */
function ClaimDetails({
  claim,
  isMine,
  teamLabel,
  privateContact,
}: {
  claim: TrialClaim;
  isMine: boolean;
  /** Set when a teammate made the claim, e.g. "your Principal Investigator". */
  teamLabel?: string;
  privateContact?: ClaimPrivateContact;
}) {
  const personalPhone = isMine && claim.phoneVisibility === 'personal' ? privateContact?.contactPhone : undefined;
  const personalEmail = isMine && claim.emailVisibility === 'personal' ? privateContact?.contactEmail : undefined;
  return (
    <div className="claim-status-box verified">
      <div className="claim-status-header">
        <span className="verified-icon">🛡️</span>
        <b>
          {isMine
            ? 'Claimed by You (Principal Investigator / Study Team)'
            : `Claimed by ${claim.claimedByName} (${claim.claimedByTitle ?? ROLE_LABEL[claim.claimedByRole] ?? claim.claimedByRole})`}
        </b>
        {teamLabel && <span className="pill approved">{teamLabel}</span>}
      </div>
      <div className="claim-contact-details">
        <span>
          📍 Location: <b>{[claim.facility, claim.city, claim.state].filter(Boolean).join(', ')}</b>
        </span>
        {claim.hospitalName && (
          <span>
            🏥 Hospital: <b>{claim.hospitalName}</b>
          </span>
        )}
      </div>
      <div className="claim-contact-details">
        {claim.contactName && <span>👤 {claim.contactName}</span>}
        {claim.contactPhone && (
          <span>
            📞 Direct Phone: <a href={`tel:${claim.contactPhone}`}>{claim.contactPhone}</a>
          </span>
        )}
        {personalPhone && (
          <span>
            📞 Phone: <a href={`tel:${personalPhone}`}>{personalPhone}</a>
            <span className="personal-tag">Personal</span>
          </span>
        )}
        {claim.contactEmail && (
          <span>
            ✉️ Email: <a href={`mailto:${claim.contactEmail}`}>{claim.contactEmail}</a>
          </span>
        )}
        {personalEmail && (
          <span>
            ✉️ Email: <a href={`mailto:${personalEmail}`}>{personalEmail}</a>
            <span className="personal-tag">Personal</span>
          </span>
        )}
        {claim.department && <span>🏢 {claim.department}</span>}
      </div>
      {claim.notes && (
        <div className="claim-notes-preview">
          <b>Screening Notes:</b> {claim.notes}
        </div>
      )}
      {claim.updatedByName && claim.updatedByName !== claim.claimedByName && (
        <div className="sup">Contact details last updated by {claim.updatedByName}</div>
      )}
    </div>
  );
}

type ClaimTarget = { trial: GroupedTrial; claim?: TrialClaim; defaultSiteKey?: string };

type TabKey = 'hospital-trials' | 'claimed-trials' | 'closed-trials' | 'coordinators' | 'hospital-pis' | 'add-trial';
type ClaimFilter = 'all' | 'unclaimed' | 'team' | 'mine';
type SiteEdit = { mode: 'add'; study: GroupedTrial } | { mode: 'edit'; site: AddedSite };

function roleBadge(p: UserProfile): string {
  if (p.role === 'doctor') return p.piTitle === 'trialDoctor' ? '🩺 Trial Team Doctor' : '🩺 Principal Investigator';
  return '📋 Clinical Research Coordinator';
}

export function DoctorDashboard({ user, profile }: { user: User; profile: UserProfile }) {
  /** A Principal Investigator (role 'doctor') — not a trial team doctor. */
  const isDoctor = profile.role === 'doctor';
  /** The PI whose team this user is on (themselves, if a PI). */
  const myTeamPiUid = teamPiUidOf(profile);
  const { rows: allTrials, loading: trialsLoading } = useTrialCatalogue();
  const [claims, setClaims] = useState<TrialClaim[]>([]);
  const [coordinators, setCoordinators] = useState<UserProfile[]>([]);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<TabKey>('hospital-trials');

  // Hospital filter state (initialized to profile.facility)
  const initialHospital = profile.facility || '';
  const [hospitalQuery, setHospitalQuery] = useState(initialHospital);
  const [cancerFilter, setCancerFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [claimFilter, setClaimFilter] = useState<ClaimFilter>('all');
  const [siteEdit, setSiteEdit] = useState<SiteEdit | null>(null);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [flashMsg, setFlashMsg] = useState<string | null>(null);
  const [addedSites, setAddedSites] = useState<AddedSite[]>([]);
  const [teamLog, setTeamLog] = useState<TeamApproval[]>([]);
  useEffect(() => subscribeAddedSites(setAddedSites), []);
  useEffect(() => {
    if (isDoctor) return subscribePiTeamApprovals(user.uid, setTeamLog);
  }, [isDoctor, user.uid]);
  const addedByKey = useMemo(() => new Map(addedSites.map((a) => [a.key, a])), [addedSites]);
  const sortedTeamLog = useMemo(
    () => [...teamLog].sort((a, b) => (timestampMs(b.decidedAt) ?? 0) - (timestampMs(a.decidedAt) ?? 0)),
    [teamLog],
  );

  function flash(message: string) {
    setFlashMsg(message);
    setTimeout(() => setFlashMsg(null), 6000);
  }

  // Modal for claiming
  const [claimTarget, setClaimTarget] = useState<ClaimTarget | null>(null);
  const [closeTarget, setCloseTarget] = useState<TrialClaim | null>(null);
  const [privateContacts, setPrivateContacts] = useState<ClaimPrivateContact[]>([]);
  const [myPublicPhone, setMyPublicPhone] = useState('');
  const closedTrials = useClosedTrials();

  useEffect(() => subscribeMyPrivateContacts(user.uid, setPrivateContacts), [user.uid]);

  // Other PIs at this PI's hospital — they can authorize the pending ones.
  const [hospitalPis, setHospitalPis] = useState<UserProfile[]>([]);
  useEffect(() => {
    if (isDoctor) return subscribeHospitalPis(profile.facility ?? '', setHospitalPis);
  }, [isDoctor, profile.facility]);
  const pendingHospitalPis = hospitalPis.filter((p) => p.uid !== user.uid && p.status === 'pending').length;
  // Only the public number is offered for trial contacts — the private one never goes public.
  useEffect(() => subscribeUserContact(user.uid, (c) => setMyPublicPhone(c?.publicPhone ?? '')), [user.uid]);

  const privateByClaim = useMemo(() => new Map(privateContacts.map((p) => [p.claimId, p])), [privateContacts]);
  const closedClaimIds = useMemo(() => new Set(closedTrials.map((c) => c.claimId)), [closedTrials]);

  // Subscriptions
  // Coordinators and trial team doctors who named this PI.
  useEffect(() => {
    if (isDoctor) {
      return subscribeTeamForPi(profile.email, setCoordinators);
    }
  }, [isDoctor, profile.email]);

  useEffect(() => {
    return subscribeAllClaims(setClaims);
  }, []);

  const pendingCoordinators = coordinators.filter((c) => c.status === 'pending');
  // Approved on this PI's team — matched on doctorUid too, so a member who later named another PI
  // isn't still counted here.
  const approvedCoordinators = coordinators.filter((c) => c.status === 'approved' && c.doctorUid === user.uid);
  const rejectedCoordinators = coordinators.filter((c) => c.status === 'rejected');

  // Every study with all of its sites — the claim modal lets the PI pick any of them.
  const groupsById = useMemo(() => new Map(groupByNctId(allTrials).map((g) => [g.nctId, g])), [allTrials]);

  // Saved phone numbers across existing claims and profile
  const savedPhones = useMemo(() => {
    const phones = new Set<string>();
    if (myPublicPhone) phones.add(myPublicPhone);
    for (const c of claims) {
      if (c.claimedByUid === user.uid && c.contactPhone) {
        phones.add(c.contactPhone);
      }
    }
    for (const p of privateContacts) {
      if (p.contactPhone) phones.add(p.contactPhone);
    }
    return Array.from(phones);
  }, [claims, user.uid, myPublicPhone, privateContacts]);

  /** A claim made by this user's trial team: their PI, or anyone working under the same PI.
   * Older claims have no `teamPiUid`, so the PI's own claims and their approved members' claims
   * are also recognised by who made them. */
  const isTeamClaim = useMemo(() => {
    const memberUids = new Set(approvedCoordinators.map((c) => c.uid));
    return (c: TrialClaim) =>
      c.claimedByUid !== user.uid &&
      Boolean(myTeamPiUid) &&
      (c.teamPiUid === myTeamPiUid || c.claimedByUid === myTeamPiUid || memberUids.has(c.claimedByUid));
  }, [approvedCoordinators, myTeamPiUid, user.uid]);

  function teamLabelFor(c: TrialClaim): string | undefined {
    if (!isTeamClaim(c)) return undefined;
    if (c.claimedByUid === myTeamPiUid) return 'Your Principal Investigator';
    return 'Your trial team';
  }

  // Site rows at the hospital typed in the filter. Every distinctive word must match the site (or
  // its acronym), so "AIIMS" no longer pulls in Tata Memorial etc. — see hospitalMatcher.
  const hospitalFilteredTrials = useMemo(() => {
    const m = hospitalMatcher(hospitalQuery);
    if (m.empty) return allTrials;
    return allTrials.filter((t) => m.matches(t.facility, t.city, t.state));
  }, [allTrials, hospitalQuery]);

  // One card per NCT ID, same as the public Trial Finder — sites are only the matching ones.
  const hospitalTrials = useMemo(() => groupByNctId(hospitalFilteredTrials), [hospitalFilteredTrials]);

  // Search, cancer type and claim-status filters within the hospital's trials. The search also
  // covers each site's investigator / contact name, so a trial registered under a doctor who has
  // no TrialWiz account yet can still be found by their name.
  const visibleTrials = useMemo(() => {
    return hospitalTrials.filter((t) => {
      if (cancerFilter !== 'all' && t.cancerType !== cancerFilter) return false;
      if (searchQuery.trim()) {
        const sq = searchQuery.trim().toLowerCase();
        const hay = `${t.nctId} ${t.briefTitle} ${t.cancerType} ${t.phases.join(' ')} ${t.sites
          .map((x) => `${x.facility} ${x.contactName ?? ''}`)
          .join(' ')} ${claims
          .filter((c) => c.nctId === t.nctId)
          .map((c) => `${c.claimedByName} ${c.contactName}`)
          .join(' ')}`.toLowerCase();
        if (!hay.includes(sq)) return false;
      }
      if (claimFilter !== 'all') {
        const siteClaims = t.sites.map((x) => claims.find((c) => claimMatchesSite(c, t.nctId, x)));
        if (claimFilter === 'unclaimed' && !siteClaims.some((c) => !c)) return false;
        if (claimFilter === 'mine' && !siteClaims.some((c) => c?.claimedByUid === user.uid)) return false;
        if (claimFilter === 'team' && !siteClaims.some((c) => c && (c.claimedByUid === user.uid || isTeamClaim(c))))
          return false;
      }
      return true;
    });
  }, [hospitalTrials, cancerFilter, searchQuery, claimFilter, claims, user.uid, isTeamClaim]);

  // Claims made by this user, by their trial team (e.g. a trial team doctor sees everything their
  // PI already claimed, without claiming it again), or by others at the same hospital — per NCT ID.
  const myClaimsByNct = useMemo(() => {
    const myHospital = (profile.facility ?? '').trim().toLowerCase();
    const map = new Map<string, TrialClaim[]>();
    for (const c of claims) {
      if (closedClaimIds.has(c.id)) continue; // closed sites live in the repository tab
      const sameHospital = myHospital && (c.hospitalName ?? '').trim().toLowerCase() === myHospital;
      if (c.claimedByUid !== user.uid && !sameHospital && !isTeamClaim(c)) continue;
      map.set(c.nctId, [...(map.get(c.nctId) ?? []), c]);
    }
    return map;
  }, [claims, user.uid, profile.facility, closedClaimIds, isTeamClaim]);

  // Closed sites this user should see: ones they closed, claimed, or at their hospital.
  const myClosedTrials = useMemo(() => {
    const myHospital = (profile.facility ?? '').trim().toLowerCase();
    const myClaimIds = new Set(claims.filter((c) => c.claimedByUid === user.uid).map((c) => c.id));
    return closedTrials.filter(
      (c) =>
        c.closedByUid === user.uid ||
        myClaimIds.has(c.claimId) ||
        (myHospital && (c.hospitalName ?? '').trim().toLowerCase() === myHospital),
    );
  }, [closedTrials, claims, user.uid, profile.facility]);

  /** Only a Principal Investigator closes trials: their own claims, their hospital's, or their coordinators'. */
  function canClose(claim: TrialClaim): boolean {
    if (!isDoctor) return false;
    const myHospital = (profile.facility ?? '').trim().toLowerCase();
    return (
      claim.claimedByUid === user.uid ||
      (Boolean(myHospital) && (claim.hospitalName ?? '').trim().toLowerCase() === myHospital) ||
      approvedCoordinators.some((c) => c.uid === claim.claimedByUid)
    );
  }

  async function handleReopen(c: ClosedTrial) {
    if (!window.confirm(`Reopen ${c.nctId} at ${c.facility}? It will appear in the active trial lists again.`)) return;
    try {
      await reopenTrial(c, { uid: user.uid, email: profile.email, name: profile.name });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to reopen the trial.');
    }
  }

  function renderClaimActions(claim: TrialClaim, primaryLabel: string) {
    const mine = claim.claimedByUid === user.uid;
    const team = isTeamClaim(claim);
    if (!mine && !team && !canClose(claim)) return null;
    return (
      <div className="pi-trial-actions">
        {mine && (
          <button className="btn" onClick={() => openExistingClaim(claim)} title="Edit contact phone/email and their visibility">
            {primaryLabel}
          </button>
        )}
        {!mine && team && (
          <button
            className="btn"
            onClick={() => openExistingClaim(claim)}
            title="Update this team claim's public contact details"
          >
            ✏️ Edit Team Claim Contact
          </button>
        )}
        {canClose(claim) && (
          <button className="btn-danger" onClick={() => setCloseTarget(claim)} title="Mark this trial as closed at this site">
            Close trial
          </button>
        )}
      </div>
    );
  }

  function getSiteClaim(nctId: string, site: TrialLocation): TrialClaim | undefined {
    return claims.find((c) => claimMatchesSite(c, nctId, site));
  }

  /** Full study for the modal; falls back to the claim's stored location if the study left the feed. */
  function studyFor(nctId: string, fallback?: TrialClaim): GroupedTrial | undefined {
    const g = groupsById.get(nctId);
    if (g || !fallback) return g;
    return {
      key: nctId,
      nctId,
      briefTitle: fallback.briefTitle ?? nctId,
      conditions: [],
      cancerType: fallback.cancerType ?? '',
      overallStatus: '',
      phases: [],
      metastatic: 'unspecified',
      lineOfTherapy: 'unspecified',
      sites: [],
    };
  }

  function openNewClaim(trial: GroupedTrial) {
    const full = studyFor(trial.nctId);
    if (!full) return;
    // Preselect the first unclaimed site at the PI's hospital.
    const preferred = trial.sites.find((x) => !getSiteClaim(trial.nctId, x));
    setClaimTarget({ trial: full, defaultSiteKey: preferred?.key });
  }

  function openExistingClaim(claim: TrialClaim) {
    const full = studyFor(claim.nctId, claim);
    if (full) setClaimTarget({ trial: full, claim });
  }

  async function decide(c: UserProfile, decision: 'approved' | 'rejected') {
    setBusyUid(c.uid);
    try {
      await decideTeamMember(c, decision, profile);
      flash(`${c.name} ${decision === 'approved' ? 'approved' : 'rejected'} — recorded in your team approval log.`);
    } catch (e) {
      console.error('[TrialWiz] team decision failed:', e);
      window.alert(e instanceof Error ? e.message : 'Failed to save the decision.');
    } finally {
      setBusyUid(null);
    }
  }
  const handleApprove = (c: UserProfile) => decide(c, 'approved');
  const handleReject = (c: UserProfile) => decide(c, 'rejected');

  /** Added locations: whoever added it, or anyone on the same PI's team, may change it. */
  function canEditAddedSite(a: AddedSite): boolean {
    return a.addedByUid === user.uid || (Boolean(myTeamPiUid) && (a.teamPiUid === myTeamPiUid || a.addedByUid === myTeamPiUid));
  }

  async function handleRemoveAddedSite(a: AddedSite) {
    if (!window.confirm(`Remove the location "${a.facility}, ${a.city}" from ${a.nctId}?`)) return;
    try {
      await removeAddedSite(a.id);
      flash(`Removed ${a.facility} from ${a.nctId}.`);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to remove the location.');
    }
  }

    return (
    <div className="tw-admin">
      <PortalHeader
        right={
          <span className="lockpill" onClick={() => auth && signOut(auth)}>
            {user.email} · sign out
          </span>
        }
      />

      <div className="wrap">
        {/* Welcome Header Banner */}
        <div className="pi-welcome-card">
          <div className="pi-header-content">
            <div className="pi-badge">
              <span>{roleBadge(profile)}</span>
            </div>
            <h1>{profile.name}</h1>
            <p className="pi-hospital-line">
              Affiliation: <b>{profile.facility || 'Hospital not set'}</b>
              {profile.city && <span> · {profile.city}</span>}
              {profile.state && <span>, {profile.state}</span>}
            </p>
            {!isDoctor && profile.requestedDoctorName && (
              <p className="pi-hospital-line">
                Principal Investigator: <b>{profile.requestedDoctorName}</b>
              </p>
            )}
            <button className="btn" style={{ marginTop: 8, fontSize: 12, padding: '4px 10px' }} onClick={() => setEditProfileOpen(true)}>
              ✏️ Edit my profile
            </button>
          </div>
          <div className="pi-kpi-group">
            <div className="pi-kpi-item">
              <span className="pi-kpi-num">{hospitalTrials.length}</span>
              <span className="pi-kpi-lbl">Trials at Hospital</span>
            </div>
            <div className="pi-kpi-item">
              <span className="pi-kpi-num">{myClaimsByNct.size}</span>
              <span className="pi-kpi-lbl">Claimed Studies</span>
            </div>
            {isDoctor && (
              <div className="pi-kpi-item">
                <span className="pi-kpi-num">{approvedCoordinators.length}</span>
                <span className="pi-kpi-lbl">Trial Team</span>
              </div>
            )}
          </div>
        </div>

        {flashMsg && (
          <div className="note" style={{ background: '#e3f7e9', color: '#16794b', borderColor: '#a3e6b7' }}>
            ✓ {flashMsg}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="portal-tabs">
          <button
            className={`portal-tab ${activeTab === 'hospital-trials' ? 'active' : ''}`}
            onClick={() => setActiveTab('hospital-trials')}
          >
            🏥 Hospital Clinical Trials ({hospitalTrials.length})
          </button>
          <button
            className={`portal-tab ${activeTab === 'claimed-trials' ? 'active' : ''}`}
            onClick={() => setActiveTab('claimed-trials')}
          >
            🛡️ Claimed Trials — You & Team ({myClaimsByNct.size})
          </button>
          <button
            className={`portal-tab ${activeTab === 'closed-trials' ? 'active' : ''}`}
            onClick={() => setActiveTab('closed-trials')}
          >
            🗄 Closed Trials ({myClosedTrials.length})
          </button>
          {isDoctor && (
            <button
              className={`portal-tab ${activeTab === 'coordinators' ? 'active' : ''}`}
              onClick={() => setActiveTab('coordinators')}
            >
              👥 Trial Team & Approvals
              {pendingCoordinators.length > 0 && (
                <span className="tab-pending-badge">{pendingCoordinators.length}</span>
              )}
            </button>
          )}
          {isDoctor && (
            <button
              className={`portal-tab ${activeTab === 'hospital-pis' ? 'active' : ''}`}
              onClick={() => setActiveTab('hospital-pis')}
            >
              🩺 Hospital PIs
              {pendingHospitalPis > 0 && <span className="tab-pending-badge">{pendingHospitalPis}</span>}
            </button>
          )}
          <button
            className={`portal-tab ${activeTab === 'add-trial' ? 'active' : ''}`}
            onClick={() => setActiveTab('add-trial')}
          >
            ➕ Add New Trial
          </button>
        </div>

        {/* TAB 1: HOSPITAL CLINICAL TRIALS */}
        {activeTab === 'hospital-trials' && (
          <div className="tab-section">
            <div className="filter-controls-card">
              <div className="filter-header-row">
                <div>
                  <h2 style={{ fontSize: 16, margin: 0 }}>Active Clinical Trials for Your Hospital</h2>
                  <span className="sup">
                    Matched from ClinicalTrials.gov and investigator submissions in India
                  </span>
                </div>
                {hospitalQuery !== initialHospital && (
                  <button
                    className="btn"
                    onClick={() => setHospitalQuery(initialHospital)}
                    style={{ fontSize: 12, padding: '4px 10px' }}
                  >
                    Reset to "{initialHospital}"
                  </button>
                )}
              </div>

              <div className="filter-inputs-grid">
                <div>
                  <label htmlFor="hosp-filter-input">Filtered Hospital Name:</label>
                  <input
                    id="hosp-filter-input"
                    value={hospitalQuery}
                    onChange={(e) => setHospitalQuery(e.target.value)}
                    placeholder="e.g. Tata Memorial, Apollo, AIIMS..."
                    className="claim-input"
                  />
                </div>
                <div>
                  <label htmlFor="cancer-filter-select">Cancer Type:</label>
                  <select
                    id="cancer-filter-select"
                    value={cancerFilter}
                    onChange={(e) => setCancerFilter(e.target.value)}
                    className="claim-select"
                  >
                    <option value="all">All Cancer Types ({hospitalTrials.length})</option>
                    {CANCERS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="search-trials-input">Search Studies / NCT ID / Investigator:</label>
                  <input
                    id="search-trials-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by title, drug, NCT id, doctor name..."
                    className="claim-input"
                  />
                </div>
                <div>
                  <label htmlFor="claim-filter-select">Claim Status:</label>
                  <select
                    id="claim-filter-select"
                    value={claimFilter}
                    onChange={(e) => setClaimFilter(e.target.value as ClaimFilter)}
                    className="claim-select"
                  >
                    <option value="all">All trials</option>
                    <option value="unclaimed">Has an unclaimed location</option>
                    <option value="team">{isDoctor ? 'Claimed by me or my team' : 'Claimed by my PI or team'}</option>
                    <option value="mine">Claimed by me</option>
                  </select>
                </div>
              </div>
            </div>

            {trialsLoading ? (
              <div className="card full">
                <div className="sup">Syncing clinical trials from ClinicalTrials.gov…</div>
              </div>
            ) : visibleTrials.length === 0 ? (
              <div className="card full" style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                <b>No clinical trials found matching these filters.</b>
                <p className="sup" style={{ margin: '8px auto', maxWidth: 500 }}>
                  Try adjusting the hospital name above to match the exact center name in ClinicalTrials.gov
                  (for example, "Tata Memorial" or "Apollo"), or clear the cancer type filter.
                </p>
                <div style={{ marginTop: 14 }}>
                  <button className="btn" onClick={() => setHospitalQuery('')}>
                    View All Indian Trials ({groupsById.size})
                  </button>
                </div>
              </div>
            ) : (
              <div className="trials-listing">
                {visibleTrials.map((trial) => {
                  const siteClaims = trial.sites.map((site) => ({ site, claim: getSiteClaim(trial.nctId, site) }));
                  const anyClaimed = siteClaims.some((x) => x.claim);
                  const totalSites = groupsById.get(trial.nctId)?.sites.length ?? trial.sites.length;
                  const study = groupsById.get(trial.nctId);
                  const hasUnclaimedSite = (study?.sites ?? trial.sites).some((x) => !getSiteClaim(trial.nctId, x));

                  return (
                    <div key={trial.key} className={`pi-trial-card ${anyClaimed ? 'claimed' : ''}`}>
                      <div className="pi-trial-top">
                        <div className="pi-trial-pills">
                          <span className="pill on">✓ {trial.overallStatus}</span>
                          {trial.phases.map((p) => (
                            <span className="pill" key={p}>
                              {p}
                            </span>
                          ))}
                          <span className="pill" style={{ background: 'var(--wash)', color: 'var(--brand-d)' }}>
                            {trial.cancerType}
                          </span>
                        </div>
                        <span className="src">{trial.nctId}</span>
                      </div>

                      <h3 className="pi-trial-title">{trial.briefTitle}</h3>

                      {totalSites > 1 && (
                        <div className="sup" style={{ marginBottom: 6 }}>
                          Runs at {totalSites} locations in India
                          {trial.sites.length < totalSites ? ` · ${trial.sites.length} matching your hospital` : ''}
                        </div>
                      )}

                      {siteClaims.map(({ site, claim }) => {
                        const added = addedByKey.get(site.key);
                        return (
                        <div key={site.key}>
                          <div className="pi-trial-site">
                            <b>📍 {site.facility}</b>
                            {site.city && <span> · {site.city}</span>}
                            {site.state && <span>, {site.state}</span>}
                            {added && (
                              <span className="sup">
                                {' '}
                                · location added by {added.addedByName}
                                {canEditAddedSite(added) && (
                                  <>
                                    {' · '}
                                    <button className="linkbtn" type="button" onClick={() => setSiteEdit({ mode: 'edit', site: added })}>
                                      Edit location
                                    </button>
                                    {!claim && (
                                      <>
                                        {' · '}
                                        <button className="linkbtn" type="button" onClick={() => handleRemoveAddedSite(added)}>
                                          Remove
                                        </button>
                                      </>
                                    )}
                                  </>
                                )}
                              </span>
                            )}
                          </div>
                          {claim ? (
                            <>
                              <ClaimDetails
                                claim={claim}
                                isMine={claim.claimedByUid === user.uid}
                                teamLabel={teamLabelFor(claim)}
                                privateContact={privateByClaim.get(claim.id)}
                              />
                              {renderClaimActions(claim, '✏️ Edit Claim Contact Info')}
                            </>
                          ) : (
                            <>
                              <div className="claim-status-box unclaimed">
                                <div className="unclaimed-text">
                                  <b>Unclaimed at this location:</b> Claim this trial to publish your direct contact
                                  number and verify Principal Investigator study leadership for referring oncologists.
                                </div>
                              </div>
                              {(site.contactPhone || site.contactName) && (
                                <div className="pi-registry-contact">
                                  <span className="sup">{added ? 'Location contact:' : 'Registry default contact:'}</span>{' '}
                                  {site.contactName && <span>{site.contactName}{site.contactPhone ? ' · ' : ''}</span>}
                                  {site.contactPhone && <span>📞 {site.contactPhone}</span>}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                        );
                      })}

                      {/* Actions */}
                      <div className="pi-trial-actions">
                        {hasUnclaimedSite && (
                          <button
                            className="btn primary"
                            onClick={() => openNewClaim(trial)}
                            title="Choose a location for this trial and add direct contact details"
                          >
                            🛡️ Claim this Trial
                          </button>
                        )}
                        {study && (
                          <button
                            className="btn"
                            onClick={() => setSiteEdit({ mode: 'add', study })}
                            title="This trial runs at a location that's missing or listed wrongly — add the correct one"
                          >
                            ➕ Add a Location
                          </button>
                        )}
                        {!trial.nctId.startsWith('TW-') && (
                          <a
                            className="btn"
                            href={trial.registryUrl || `https://clinicaltrials.gov/study/${trial.nctId}`}
                            target="_blank"
                            rel="noopener"
                          >
                            View Registry Record ↗
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: MY CLAIMED TRIALS */}
        {activeTab === 'claimed-trials' && (
          <div className="tab-section">
            <div className="sechead2" style={{ marginTop: 0 }}>
              <h2>Trials Claimed by You, Your Trial Team & Your Center</h2>
              <span className="sup">
                {isDoctor
                  ? 'Includes trials claimed by your coordinators and trial team doctors — no need to claim them twice.'
                  : 'Includes every trial your Principal Investigator and teammates have claimed — no need to claim them again.'}
              </span>
            </div>

            {myClaimsByNct.size === 0 ? (
              <div className="card full" style={{ textAlign: 'center', padding: '36px 20px' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🛡️</div>
                <b>No claimed trials for you or your team yet.</b>
                <p className="sup" style={{ margin: '8px auto', maxWidth: 440 }}>
                  Switch to the "Hospital Clinical Trials" tab to browse recruiting studies at your hospital
                  and claim them to add your direct contact info.
                </p>
                <button
                  className="btn primary"
                  style={{ marginTop: 12 }}
                  onClick={() => setActiveTab('hospital-trials')}
                >
                  Browse Hospital Trials
                </button>
              </div>
            ) : (
              <div className="trials-listing">
                {[...myClaimsByNct.entries()].map(([nctId, nctClaims]) => {
                  const study = groupsById.get(nctId);
                  return (
                    <div key={nctId} className="pi-trial-card claimed">
                      <div className="pi-trial-top">
                        <div className="pi-trial-pills">
                          {study?.overallStatus && <span className="pill on">✓ {study.overallStatus}</span>}
                          <span className="pill" style={{ background: '#e3f7e9', color: '#16794b' }}>
                            ✓ Active Claim{nctClaims.length > 1 ? `s (${nctClaims.length} locations)` : ''}
                          </span>
                          {(study?.cancerType || nctClaims[0].cancerType) && (
                            <span className="pill" style={{ background: 'var(--wash)', color: 'var(--brand-d)' }}>
                              {study?.cancerType || nctClaims[0].cancerType}
                            </span>
                          )}
                        </div>
                        <span className="src">{nctId}</span>
                      </div>
                      <h3 className="pi-trial-title">{study?.briefTitle ?? nctClaims[0].briefTitle ?? nctId}</h3>

                      {nctClaims.map((claim) => (
                        <div key={claim.id}>
                          <ClaimDetails
                            claim={claim}
                            isMine={claim.claimedByUid === user.uid}
                            teamLabel={teamLabelFor(claim)}
                            privateContact={privateByClaim.get(claim.id)}
                          />
                          {renderClaimActions(claim, 'Manage Claim & Contact Info')}
                        </div>
                      ))}

                      <div className="pi-trial-actions">
                        <a
                          className="btn"
                          href={`https://clinicaltrials.gov/study/${nctId}`}
                          target="_blank"
                          rel="noopener"
                        >
                          Registry Record ↗
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* CLOSED TRIALS — the repository */}
        {activeTab === 'closed-trials' && (
          <div className="tab-section">
            <div className="sechead2" style={{ marginTop: 0 }}>
              <h2>Closed Trial Repository</h2>
              <span className="sup">
                {isDoctor
                  ? 'Trials closed at your center — no longer shown in active lists. Reopen one if it was closed by mistake.'
                  : 'Trials your Principal Investigator closed at your center. Only a Principal Investigator can close or reopen a trial.'}
              </span>
            </div>
            {myClosedTrials.length === 0 ? (
              <div className="card full" style={{ textAlign: 'center', padding: '36px 20px' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🗄</div>
                <b>No closed trials yet.</b>
                <p className="sup" style={{ margin: '8px auto', maxWidth: 440 }}>
                  {isDoctor
                    ? 'When a trial finishes at your site, use "Close trial" on its claim to move it here.'
                    : 'When your Principal Investigator closes a trial, it will appear here.'}
                </p>
              </div>
            ) : (
              <div className="trials-listing">
                {myClosedTrials.map((c) => (
                  <div key={c.id} className="pi-trial-card">
                    <div className="pi-trial-top">
                      <div className="pi-trial-pills">
                        <span className="pill closed-pill">Closed</span>
                        {c.cancerType && (
                          <span className="pill" style={{ background: 'var(--wash)', color: 'var(--brand-d)' }}>
                            {c.cancerType}
                          </span>
                        )}
                      </div>
                      <span className="src">{c.nctId}</span>
                    </div>
                    <h3 className="pi-trial-title">{c.briefTitle || c.nctId}</h3>
                    <div className="claim-contact-details">
                      <span>
                        📍 <b>{[c.facility, c.city, c.state].filter(Boolean).join(', ')}</b>
                      </span>
                      <span>
                        Closed by <b>{c.closedByName}</b> · {formatTimestamp(c.closedAt)}
                      </span>
                    </div>
                    {c.reason && (
                      <div className="claim-notes-preview">
                        <b>Reason:</b> {c.reason}
                      </div>
                    )}
                    {isDoctor && c.closedByUid === user.uid && (
                      <div className="pi-trial-actions">
                        <button className="btn" onClick={() => handleReopen(c)}>
                          Reopen trial
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: COORDINATOR APPROVALS (DOCTORS ONLY) */}
        {activeTab === 'hospital-pis' && isDoctor && (
          <div className="tab-section">
            <HospitalPisSection me={profile} hospitalPis={hospitalPis} />
          </div>
        )}

        {activeTab === 'coordinators' && isDoctor && (
          <div className="tab-section">
            <div className="sechead2" style={{ marginTop: 0 }}>
              <h2>Team Requests</h2>
              <span className="sup">Trial coordinators and trial team doctors who named your email at sign-up</span>
            </div>
            <div className="card full">
              {pendingCoordinators.length === 0 ? (
                <div className="sup">No pending requests right now.</div>
              ) : (
                pendingCoordinators.map((c) => (
                  <RequestRow
                    key={c.uid}
                    coordinator={c}
                    onApprove={() => handleApprove(c)}
                    onReject={() => handleReject(c)}
                    busy={busyUid === c.uid}
                  />
                ))
              )}
            </div>

            <div className="sechead2">
              <h2>Your Trial Team</h2>
              <span className="sup">They can claim trials, add locations and keep your team's claims up to date</span>
            </div>
            <div className="card full">
              {approvedCoordinators.length === 0 ? (
                <div className="sup">
                  None approved yet — approve a request above to let them start submitting trials and managing claims.
                </div>
              ) : (
                approvedCoordinators.map((c) => (
                  <div className="reqrow" key={c.uid}>
                    <div className="reqinfo">
                      <b>
                        {c.name} <span className="pill">{ROLE_LABEL[c.role] ?? c.role}</span>
                      </b>
                      <span>
                        {c.email} · {c.facility}, {c.city}
                      </span>
                    </div>
                    <span className="pill approved">Approved</span>
                  </div>
                ))
              )}
            </div>

            {rejectedCoordinators.length > 0 && (
              <>
                <div className="sechead2">
                  <h2>Rejected Requests</h2>
                </div>
                <div className="card full">
                  {rejectedCoordinators.map((c) => (
                    <div className="reqrow" key={c.uid}>
                      <div className="reqinfo">
                        <b>
                          {c.name} <span className="pill">{ROLE_LABEL[c.role] ?? c.role}</span>
                        </b>
                        <span>{c.email}</span>
                      </div>
                      <button className="btn" disabled={busyUid === c.uid} onClick={() => handleApprove(c)}>
                        Approve instead
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="sechead2">
              <h2>Team approval log</h2>
              <span className="sup">Every approval and rejection on your team — who decided, and when</span>
            </div>
            <div className="card full">
              {sortedTeamLog.length === 0 ? (
                <div className="sup">No decisions recorded yet. Approvals made from now on are logged here.</div>
              ) : (
                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Team member</th>
                        <th>Role</th>
                        <th>Decision</th>
                        <th>By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTeamLog.map((h) => (
                        <tr key={h.id}>
                          <td>{formatTimestamp(h.decidedAt)}</td>
                          <td>
                            <b>{h.memberName}</b>
                            <div className="sup">{h.memberEmail}</div>
                          </td>
                          <td>{ROLE_LABEL[h.memberRole] ?? h.memberRole}</td>
                          <td>
                            <span className={`pill ${h.decision}`}>{h.decision === 'approved' ? 'Approved' : 'Rejected'}</span>
                          </td>
                          <td>
                            {h.decidedByRole === 'admin' ? 'TrialWiz admin' : h.decidedByName}
                            {h.decidedByUid === user.uid && <span className="sup"> (you)</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: ADD NEW TRIAL */}
        {activeTab === 'add-trial' && (
          <div className="tab-section">
            <AddTrialForm user={user} profile={profile} />
            <MySubmittedTrials uid={user.uid} />
          </div>
        )}
      </div>

      {/* Claim Trial Modal */}
      {claimTarget && (
        <ClaimTrialModal
          key={`${claimTarget.trial.nctId}__${claimTarget.claim?.id ?? 'new'}`}
          trial={claimTarget.trial}
          profile={profile}
          existingClaim={claimTarget.claim}
          allClaims={claims}
          defaultSiteKey={claimTarget.defaultSiteKey}
          savedPhones={savedPhones}
          defaultPhone={myPublicPhone}
          privateContact={claimTarget.claim ? privateByClaim.get(claimTarget.claim.id) : undefined}
          isOpen
          onClose={() => setClaimTarget(null)}
        />
      )}

      {closeTarget && (
        <CloseTrialModal claim={closeTarget} pi={profile} onClose={() => setCloseTarget(null)} />
      )}

      {siteEdit?.mode === 'add' && (
        <SiteFormModal
          badge="Add a Location"
          title="Add a trial location"
          subtitle={`${siteEdit.study.nctId} · ${siteEdit.study.briefTitle}`}
          initial={{
            facility: profile.facility ?? '',
            city: profile.city ?? '',
            state: profile.state ?? '',
            contactName: profile.name,
            contactPhone: myPublicPhone,
            contactEmail: profile.email,
          }}
          submitLabel="Add location"
          note="The location appears on the public Trial Finder straight away. You can then claim it to verify it as your site."
          onSubmit={async (f) => {
            await addSiteToTrial(siteEdit.study, f, profile);
            flash(`Added ${f.facility} to ${siteEdit.study.nctId}.`);
          }}
          onClose={() => setSiteEdit(null)}
        />
      )}
      {siteEdit?.mode === 'edit' && (
        <SiteFormModal
          badge="Edit Location"
          title="Edit trial location"
          subtitle={`${siteEdit.site.nctId} · added by ${siteEdit.site.addedByName}`}
          initial={{
            facility: siteEdit.site.facility,
            city: siteEdit.site.city,
            state: siteEdit.site.state,
            contactName: siteEdit.site.contactName,
            contactPhone: siteEdit.site.contactPhone,
            contactEmail: siteEdit.site.contactEmail,
          }}
          submitLabel="Save location"
          note={
            claims.some((c) => c.nctId === siteEdit.site.nctId && claimMatchesSite(c, c.nctId, siteEdit.site))
              ? 'This location is claimed. Renaming it detaches the claim — release the claim first, or just update the contact details.'
              : undefined
          }
          onSubmit={async (f) => {
            await updateAddedSite(siteEdit.site.id, f);
            flash(`Updated the location for ${siteEdit.site.nctId}.`);
          }}
          onClose={() => setSiteEdit(null)}
        />
      )}

      {editProfileOpen && (
        <EditAccountModal account={profile} mode="self" onClose={() => setEditProfileOpen(false)} onSaved={flash} />
      )}
    </div>
  );
}
