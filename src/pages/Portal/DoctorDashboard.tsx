import { signOut, type User } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';
import { CANCERS } from '../../data/cancerTaxonomy';
import { auth } from '../../firebase';
import { useClosedTrials } from '../../hooks/useClosedTrials';
import { useTrialCatalogue } from '../../hooks/useTrialCatalogue';
import { reopenTrial } from '../../services/closedTrials';
import { subscribeHospitalPis } from '../../services/piAuthorization';
import {
  approveCoordinator,
  rejectCoordinator,
  subscribeCoordinatorsForDoctor,
  subscribeUserContact,
} from '../../services/profiles';
import { claimMatchesSite, subscribeAllClaims, subscribeMyPrivateContacts } from '../../services/trialClaims';
import type { ClaimPrivateContact, ClosedTrial, TrialClaim, UserProfile } from '../../types';
import { formatTimestamp } from '../../utils/timestamps';
import { groupByNctId, type GroupedTrial, type TrialLocation } from '../../utils/groupTrials';
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
        <b>{coordinator.name}</b>
        <span>
          {coordinator.email} · {coordinator.facility}, {coordinator.city}
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
  privateContact,
}: {
  claim: TrialClaim;
  isMine: boolean;
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
            : `Claimed by ${claim.claimedByName} (${claim.claimedByRole})`}
        </b>
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
    </div>
  );
}

type ClaimTarget = { trial: GroupedTrial; claim?: TrialClaim; defaultSiteKey?: string };

type TabKey = 'hospital-trials' | 'claimed-trials' | 'closed-trials' | 'coordinators' | 'hospital-pis' | 'add-trial';

export function DoctorDashboard({ user, profile }: { user: User; profile: UserProfile }) {
  const isDoctor = profile.role === 'doctor';
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
  useEffect(() => {
    if (isDoctor) {
      return subscribeCoordinatorsForDoctor(profile.email, setCoordinators);
    }
  }, [isDoctor, profile.email]);

  useEffect(() => {
    return subscribeAllClaims(setClaims);
  }, []);

  const pendingCoordinators = coordinators.filter((c) => c.status === 'pending');
  const approvedCoordinators = coordinators.filter((c) => c.status === 'approved');
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

  // Site rows at the doctor's hospital
  const hospitalFilteredTrials = useMemo(() => {
    const hQuery = hospitalQuery.trim().toLowerCase();
    return allTrials.filter((t) => {
      if (!hQuery) return true;
      const fac = (t.facility || '').toLowerCase();
      const city = (t.city || '').toLowerCase();

      // Direct inclusion either way
      const facilityMatch = fac.includes(hQuery) || hQuery.includes(fac);
      // If query is multiple words, check if primary significant word matches
      const words = hQuery.split(/\s+/).filter((w) => w.length > 3 && !['hospital', 'centre', 'center', 'institute', 'cancer'].includes(w));
      const wordMatch = words.length > 0 && words.some((w) => fac.includes(w));

      return facilityMatch || wordMatch || (profile.city && city.includes(profile.city.toLowerCase()) && wordMatch);
    });
  }, [allTrials, hospitalQuery, profile.city]);

  // One card per NCT ID, same as the public Trial Finder — sites are only the matching ones.
  const hospitalTrials = useMemo(() => groupByNctId(hospitalFilteredTrials), [hospitalFilteredTrials]);

  // Search & Cancer filtered trials within hospital trials
  const visibleTrials = useMemo(() => {
    return hospitalTrials.filter((t) => {
      if (cancerFilter !== 'all' && t.cancerType !== cancerFilter) return false;
      if (searchQuery.trim()) {
        const sq = searchQuery.trim().toLowerCase();
        const hay = `${t.nctId} ${t.briefTitle} ${t.cancerType} ${t.phases.join(' ')} ${t.sites.map((x) => x.facility).join(' ')}`.toLowerCase();
        if (!hay.includes(sq)) return false;
      }
      return true;
    });
  }, [hospitalTrials, cancerFilter, searchQuery]);

  // Claims made by this user or by others registered with the same hospital, grouped per NCT ID
  const myClaimsByNct = useMemo(() => {
    const myHospital = (profile.facility ?? '').trim().toLowerCase();
    const map = new Map<string, TrialClaim[]>();
    for (const c of claims) {
      if (closedClaimIds.has(c.id)) continue; // closed sites live in the repository tab
      const sameHospital = myHospital && (c.hospitalName ?? '').trim().toLowerCase() === myHospital;
      if (c.claimedByUid !== user.uid && !sameHospital) continue;
      map.set(c.nctId, [...(map.get(c.nctId) ?? []), c]);
    }
    return map;
  }, [claims, user.uid, profile.facility, closedClaimIds]);

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
    if (!mine && !canClose(claim)) return null;
    return (
      <div className="pi-trial-actions">
        {mine && (
          <button className="btn" onClick={() => openExistingClaim(claim)} title="Edit contact phone/email and their visibility">
            {primaryLabel}
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

  async function handleApprove(c: UserProfile) {
    setBusyUid(c.uid);
    try {
      await approveCoordinator(c.uid, user.uid);
    } finally {
      setBusyUid(null);
    }
  }

  async function handleReject(c: UserProfile) {
    setBusyUid(c.uid);
    try {
      await rejectCoordinator(c.uid);
    } finally {
      setBusyUid(null);
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
              <span>{isDoctor ? '🩺 Principal Investigator' : '📋 Clinical Research Coordinator'}</span>
            </div>
            <h1>{profile.name}</h1>
            <p className="pi-hospital-line">
              Affiliation: <b>{profile.facility || 'Hospital not set'}</b>
              {profile.city && <span> · {profile.city}</span>}
              {profile.state && <span>, {profile.state}</span>}
            </p>
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
                <span className="pi-kpi-lbl">Coordinators</span>
              </div>
            )}
          </div>
        </div>

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
            🛡️ Claimed Trials ({myClaimsByNct.size})
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
              👥 Coordinator Approvals
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
                  <label htmlFor="search-trials-input">Search Studies / NCT ID:</label>
                  <input
                    id="search-trials-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by title, drug, NCT id..."
                    className="claim-input"
                  />
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
                <b>No clinical trials found matching "{hospitalQuery}".</b>
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

                      {siteClaims.map(({ site, claim }) => (
                        <div key={site.key}>
                          <div className="pi-trial-site">
                            <b>📍 {site.facility}</b>
                            {site.city && <span> · {site.city}</span>}
                            {site.state && <span>, {site.state}</span>}
                          </div>
                          {claim ? (
                            <>
                              <ClaimDetails
                                claim={claim}
                                isMine={claim.claimedByUid === user.uid}
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
                              {site.contactPhone && (
                                <div className="pi-registry-contact">
                                  <span className="sup">Registry default contact:</span>{' '}
                                  {site.contactName && <span>{site.contactName} · </span>}
                                  <span>📞 {site.contactPhone}</span>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      ))}

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
                        <a
                          className="btn"
                          href={`https://clinicaltrials.gov/study/${trial.nctId}`}
                          target="_blank"
                          rel="noopener"
                        >
                          View on ClinicalTrials.gov ↗
                        </a>
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
              <h2>Trials Claimed for Your Center</h2>
              <span className="sup">
                Direct contact details and verified investigator badges published for patients & doctors
              </span>
            </div>

            {myClaimsByNct.size === 0 ? (
              <div className="card full" style={{ textAlign: 'center', padding: '36px 20px' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🛡️</div>
                <b>You haven't claimed any clinical trials yet.</b>
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
              <h2>Coordinator Requests</h2>
              <span className="sup">Trial coordinators who named your email at sign-up</span>
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
              <h2>Your Approved Coordinators</h2>
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
                      <b>{c.name}</b>
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
                  <h2>Rejected Coordinators</h2>
                </div>
                <div className="card full">
                  {rejectedCoordinators.map((c) => (
                    <div className="reqrow" key={c.uid}>
                      <div className="reqinfo">
                        <b>{c.name}</b>
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
    </div>
  );
}
