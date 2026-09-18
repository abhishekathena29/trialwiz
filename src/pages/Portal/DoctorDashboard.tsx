import { signOut, type User } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';
import { CANCERS } from '../../data/cancerTaxonomy';
import { auth } from '../../firebase';
import { useTrialCatalogue } from '../../hooks/useTrialCatalogue';
import { approveCoordinator, rejectCoordinator, subscribeCoordinatorsForDoctor } from '../../services/profiles';
import { makeClaimId, subscribeAllClaims } from '../../services/trialClaims';
import type { TrialClaim, TrialSite, UserProfile } from '../../types';
import { AddTrialForm } from './AddTrialForm';
import { ClaimTrialModal } from './ClaimTrialModal';
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

type TabKey = 'hospital-trials' | 'claimed-trials' | 'coordinators' | 'add-trial';

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
  const [claimingTrial, setClaimingTrial] = useState<TrialSite | null>(null);

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

  // Claims map: keyed by `${nctId}__${facilityClean}` or `${nctId}__${facility}`
  const claimsMap = useMemo(() => {
    const map = new Map<string, TrialClaim>();
    for (const c of claims) {
      map.set(c.id, c);
      // Also map with clean id
      map.set(makeClaimId(c.nctId, c.facility), c);
      map.set(`${c.nctId}__${c.facility.toLowerCase().trim()}`, c);
    }
    return map;
  }, [claims]);

  // Saved phone numbers across existing claims and profile
  const savedPhones = useMemo(() => {
    const phones = new Set<string>();
    for (const c of claims) {
      if (c.claimedByUid === user.uid && c.contactPhone) {
        phones.add(c.contactPhone);
      }
    }
    return Array.from(phones);
  }, [claims, user.uid]);

  // Filter trials for the doctor's hospital
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

  // Search & Cancer filtered trials within hospital trials
  const visibleTrials = useMemo(() => {
    return hospitalFilteredTrials.filter((t) => {
      if (cancerFilter !== 'all' && t.cancerType !== cancerFilter) return false;
      if (searchQuery.trim()) {
        const sq = searchQuery.trim().toLowerCase();
        const hay = `${t.nctId} ${t.briefTitle} ${t.cancerType} ${t.phases.join(' ')} ${t.facility}`.toLowerCase();
        if (!hay.includes(sq)) return false;
      }
      return true;
    });
  }, [hospitalFilteredTrials, cancerFilter, searchQuery]);

  // Claims made by this user or for this hospital
  const myClaimedTrials = useMemo(() => {
    return allTrials.filter((t) => {
      const claim = claimsMap.get(makeClaimId(t.nctId, t.facility)) || claimsMap.get(`${t.nctId}__${t.facility.toLowerCase().trim()}`);
      return claim && (claim.claimedByUid === user.uid || claim.facility.toLowerCase().includes(hospitalQuery.toLowerCase()));
    });
  }, [allTrials, claimsMap, user.uid, hospitalQuery]);

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

  function getTrialClaim(trial: TrialSite): TrialClaim | undefined {
    return (
      claimsMap.get(makeClaimId(trial.nctId, trial.facility)) ||
      claimsMap.get(`${trial.nctId}__${trial.facility.toLowerCase().trim()}`)
    );
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
              <span className="pi-kpi-num">{hospitalFilteredTrials.length}</span>
              <span className="pi-kpi-lbl">Trials at Hospital</span>
            </div>
            <div className="pi-kpi-item">
              <span className="pi-kpi-num">{myClaimedTrials.length}</span>
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
            🏥 Hospital Clinical Trials ({hospitalFilteredTrials.length})
          </button>
          <button
            className={`portal-tab ${activeTab === 'claimed-trials' ? 'active' : ''}`}
            onClick={() => setActiveTab('claimed-trials')}
          >
            🛡️ Claimed Trials ({myClaimedTrials.length})
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
                    <option value="all">All Cancer Types ({hospitalFilteredTrials.length})</option>
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
                    View All Indian Trials ({allTrials.length})
                  </button>
                </div>
              </div>
            ) : (
              <div className="trials-listing">
                {visibleTrials.map((trial) => {
                  const claim = getTrialClaim(trial);
                  const isClaimedByMe = claim?.claimedByUid === user.uid;

                  return (
                    <div key={trial.key} className={`pi-trial-card ${claim ? 'claimed' : ''}`}>
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

                      <div className="pi-trial-site">
                        <b>📍 {trial.facility}</b>
                        {trial.city && <span> · {trial.city}</span>}
                        {trial.state && <span>, {trial.state}</span>}
                      </div>

                      {/* Claim Status Badge and Details */}
                      {claim ? (
                        <div className="claim-status-box verified">
                          <div className="claim-status-header">
                            <span className="verified-icon">🛡️</span>
                            <b>
                              {isClaimedByMe
                                ? 'Claimed by You (Principal Investigator / Study Team)'
                                : `Claimed by ${claim.claimedByName} (${claim.claimedByRole})`}
                            </b>
                          </div>
                          <div className="claim-contact-details">
                            {claim.contactPhone && (
                              <span>
                                📞 Direct Phone: <a href={`tel:${claim.contactPhone}`}>{claim.contactPhone}</a>
                              </span>
                            )}
                            {claim.contactEmail && (
                              <span>
                                ✉️ Email: <a href={`mailto:${claim.contactEmail}`}>{claim.contactEmail}</a>
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
                      ) : (
                        <div className="claim-status-box unclaimed">
                          <div className="unclaimed-text">
                            <b>Unclaimed Trial at your Center:</b> Claim this trial to publish your direct contact
                            number and verify Principal Investigator study leadership for referring oncologists.
                          </div>
                        </div>
                      )}

                      {/* Registry Contacts */}
                      {trial.contactPhone && !claim && (
                        <div className="pi-registry-contact">
                          <span className="sup">Registry default contact:</span>{' '}
                          {trial.contactName && <span>{trial.contactName} · </span>}
                          <span>📞 {trial.contactPhone}</span>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="pi-trial-actions">
                        {claim ? (
                          <button
                            className="btn"
                            onClick={() => setClaimingTrial(trial)}
                            title="Edit contact phone number or claim details"
                          >
                            ✏️ Edit Claim Contact Info
                          </button>
                        ) : (
                          <button
                            className="btn primary"
                            onClick={() => setClaimingTrial(trial)}
                            title="Claim this trial for your center and add direct contact details"
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

            {myClaimedTrials.length === 0 ? (
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
                {myClaimedTrials.map((trial) => {
                  const claim = getTrialClaim(trial);
                  return (
                    <div key={trial.key} className="pi-trial-card claimed">
                      <div className="pi-trial-top">
                        <div className="pi-trial-pills">
                          <span className="pill on">✓ {trial.overallStatus}</span>
                          <span className="pill" style={{ background: '#e3f7e9', color: '#16794b' }}>
                            ✓ Active Claim
                          </span>
                        </div>
                        <span className="src">{trial.nctId}</span>
                      </div>
                      <h3 className="pi-trial-title">{trial.briefTitle}</h3>
                      <div className="pi-trial-site">
                        <b>📍 {trial.facility}</b>
                        {trial.city && <span> · {trial.city}</span>}
                      </div>

                      {claim && (
                        <div className="claim-status-box verified">
                          <div className="claim-contact-details">
                            {claim.contactPhone && (
                              <span>
                                📞 Direct Line: <a href={`tel:${claim.contactPhone}`}>{claim.contactPhone}</a>
                              </span>
                            )}
                            {claim.contactEmail && (
                              <span>
                                ✉️ Email: <a href={`mailto:${claim.contactEmail}`}>{claim.contactEmail}</a>
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
                      )}

                      <div className="pi-trial-actions">
                        <button className="btn primary" onClick={() => setClaimingTrial(trial)}>
                          Manage Claim & Contact Info
                        </button>
                        <a
                          className="btn"
                          href={`https://clinicaltrials.gov/study/${trial.nctId}`}
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

        {/* TAB 3: COORDINATOR APPROVALS (DOCTORS ONLY) */}
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
      {claimingTrial && (
        <ClaimTrialModal
          trial={claimingTrial}
          profile={profile}
          existingClaim={getTrialClaim(claimingTrial)}
          savedPhones={savedPhones}
          isOpen={Boolean(claimingTrial)}
          onClose={() => setClaimingTrial(null)}
        />
      )}
    </div>
  );
}
