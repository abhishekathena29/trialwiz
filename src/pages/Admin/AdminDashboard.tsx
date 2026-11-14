import { signOut, type User } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';
import {
  aggregateDemand,
  aggregateUsage,
  displayCount,
  fetchDemandRecords,
  fetchUsageEvents,
  type DemandAggregate,
  type DemandRecord,
  type UsageRecord,
} from '../../analytics/aggregate';
import { auth } from '../../firebase';
import { useTrialCatalogue } from '../../hooks/useTrialCatalogue';
import { useClosedTrials } from '../../hooks/useClosedTrials';
import { subscribeAuditLog } from '../../services/audit';
import { reopenTrial } from '../../services/closedTrials';
import { authorizePi, subscribeAllPiAuthorizations } from '../../services/piAuthorization';
import {
  changeCoordinatorToPi,
  rejectDoctor,
  subscribeAllUserContacts,
  subscribeAllUsers,
} from '../../services/profiles';
import { subscribeAllClaims } from '../../services/trialClaims';
import type { AuditEntry, ClosedTrial, PiAuthorization, TrialClaim, UserContact, UserProfile } from '../../types';
import { formatTimestamp, timestampMs } from '../../utils/timestamps';
import { matchesSearch } from '../../utils/search';
import { AllDoctorsSection } from './AllDoctorsSection';
import { countUniqueTrials, tallyByCancerType, tallyByCentre } from '../../utils/trialStats';
import { AdminHeader } from './AdminHeader';
import { ChangeRoleModal } from './ChangeRoleModal';
import { CreateAccountModal } from './CreateAccountModal';

const AUDIT_LABEL: Record<string, string> = {
  trial_closed: 'Trial closed',
  trial_reopened: 'Trial reopened',
  role_changed: 'Role changed',
  pi_authorized: 'PI authorized',
};

/** Labels for the New-accounts breakdown. Admin accounts aren't counted as registrations. */
function accountTypeLabel(u: UserProfile): string | null {
  if (u.role === 'doctor') return 'Principal Investigators';
  if (u.role === 'coordinator') return 'Trial coordinators';
  if (u.role === 'user') return u.userType === 'doctor' ? 'Doctors' : 'Individuals';
  return null;
}

const PERIODS: Array<[number, string]> = [
  [30, 'Last 30 days'],
  [90, 'Last 90 days'],
  [365, 'Last 12 months'],
];

function Bars({ rows, mask = true, emptyLabel = 'No searches recorded in this period yet.' }: { rows: [string, number][]; mask?: boolean; emptyLabel?: string }) {
  if (!rows.length) return <div className="sup">{emptyLabel}</div>;
  const max = Math.max(...rows.map((r) => r[1]));
  return (
    <>
      {rows.map(([k, v]) => (
        <div className="bar" key={k}>
          <span className="k">{k}</span>
          <span className="track">
            <span
              className="fill"
              style={{ width: `${max && v > 0 ? Math.max(4, Math.round((v / max) * 100)) : 0}%` }}
            />
          </span>
          <span className="v">{mask ? displayCount(v) : v.toLocaleString()}</span>
        </div>
      ))}
    </>
  );
}

function priorityTag(searches: number): { label: string; cls: string } {
  if (searches >= 100) return { label: 'HIGH', cls: 'high' };
  if (searches >= 20) return { label: 'MED', cls: 'med' };
  return { label: 'LOW', cls: 'low' };
}

function reportRowsHtml(rows: [string, number][]): string {
  if (!rows.length) return '<p class="sup">No data recorded in this period.</p>';
  return `<table><tbody>${rows
    .map(([k, v]) => `<tr><td>${k}</td><td class="num">${displayCount(v)}</td></tr>`)
    .join('')}</tbody></table>`;
}

function buildSponsorReportHtml(agg: DemandAggregate, periodDays: number): string {
  const generated = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  const unmetRows = agg.unmet
    .slice(0, 20)
    .map(
      (row) =>
        `<tr><td>${row.cond}</td><td>${row.where}</td><td class="num">${displayCount(row.searches)}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html><head><title>TrialWiz — Sponsor Demand Report</title><style>
    body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2a2140;padding:34px;max-width:820px;margin:0 auto;}
    h1{font-size:20px;margin:0 0 2px;}
    .sub{color:#7c7488;font-size:12.5px;margin:0 0 22px;}
    h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#4a4160;margin:26px 0 10px;}
    .kpis{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:6px;}
    .kpi{border:1px solid #e9e3ee;border-radius:12px;padding:12px 16px;min-width:140px;}
    .kpi .n{font-size:22px;font-weight:750;color:#6423b8;}
    .kpi .l{font-size:11px;color:#7c7488;text-transform:uppercase;letter-spacing:.04em;margin-top:2px;}
    table{width:100%;border-collapse:collapse;font-size:13px;}
    td{padding:6px 8px;border-bottom:1px solid #e9e3ee;}
    td.num{text-align:right;font-weight:700;width:80px;}
    .sup{color:#7c7488;font-style:italic;font-size:12.5px;}
    .disc{margin-top:30px;font-size:11px;color:#7c7488;border-top:1px solid #e9e3ee;padding-top:12px;line-height:1.5;}
  </style></head><body>
    <h1>TrialWiz — Sponsor Demand Report</h1>
    <p class="sub">Last ${periodDays} days · generated ${generated} · aggregate, k-anonymised (cells &lt;5 suppressed)</p>
    <div class="kpis">
      <div class="kpi"><div class="n">${displayCount(agg.totalSearches)}</div><div class="l">Searches</div></div>
      <div class="kpi"><div class="n">${displayCount(agg.distinctCities)}</div><div class="l">Cities / regions</div></div>
      <div class="kpi"><div class="n">${agg.zeroResultPct}%</div><div class="l">No matching trial</div></div>
      <div class="kpi"><div class="n">${displayCount(agg.distinctCancerTypes)}</div><div class="l">Cancer types searched</div></div>
    </div>
    <h2>Top demand by cancer type</h2>
    ${reportRowsHtml(agg.byCancer)}
    <h2>Top demand by location</h2>
    ${reportRowsHtml(agg.byCity)}
    <h2>Demand by therapy setting</h2>
    ${reportRowsHtml(agg.bySetting)}
    <h2>Unmet demand — no recruiting site in range</h2>
    ${
      unmetRows
        ? `<table><thead><tr><td><b>Cancer / setting</b></td><td><b>Region</b></td><td class="num"><b>Searches</b></td></tr></thead><tbody>${unmetRows}</tbody></table>`
        : '<p class="sup">No unmet-demand searches recorded in this period.</p>'
    }
    <div class="disc">An aggregate signal of registered search demand on TrialWiz's public trial finder. No patient identity, phone number, or individual-level data is included or derivable from this report.</div>
  </body></html>`;
}

function toCsv(records: DemandRecord[]): string {
  const header = 'cancer_type,region,line_of_therapy,metastatic_facet,result_count,searched_at\n';
  const body = records
    .map((r) => [r.cond, r.where, r.line, r.met, r.resultCount, r.createdAt.toISOString()].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  return header + body;
}

function toUsageCsv(records: UsageRecord[]): string {
  const header = 'type,label,meta,occurred_at\n';
  const body = records
    .map((r) => [r.type, r.label, r.meta, r.createdAt.toISOString()].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  return header + body;
}

export function AdminDashboard({ user }: { user: User }) {
  const { rows: catalogueRows, loading: catalogueLoading } = useTrialCatalogue();
  const [periodDays, setPeriodDays] = useState(90);
  const [records, setRecords] = useState<DemandRecord[] | null>(null);
  const [usageRecords, setUsageRecords] = useState<UsageRecord[] | null>(null);
  const [error, setError] = useState('');

  const [adminTab, setAdminTab] = useState<'demand' | 'catalogue' | 'doctors' | 'closed'>('demand');
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [claims, setClaims] = useState<TrialClaim[]>([]);
  const [createDoctorOpen, setCreateDoctorOpen] = useState(false);
  const [busyDoctorUid, setBusyDoctorUid] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [piSearch, setPiSearch] = useState('');
  // Start of the selected period — set by the data-loading effect (Date.now() can't run in render).
  const [periodStartMs, setPeriodStartMs] = useState<number | null>(null);
  const [coordSearch, setCoordSearch] = useState('');
  const [authHistory, setAuthHistory] = useState<PiAuthorization[]>([]);
  const [contacts, setContacts] = useState<Map<string, UserContact>>(new Map());
  const [roleChangeTarget, setRoleChangeTarget] = useState<UserProfile | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const closedTrials = useClosedTrials();
  const adminActor = useMemo(() => ({ uid: user.uid, email: user.email ?? '', name: 'TrialWiz admin' }), [user]);

  useEffect(() => subscribeAllUsers(setAllUsers), []);
  useEffect(() => subscribeAllPiAuthorizations(setAuthHistory), []);

  const doctors = useMemo(() => allUsers.filter((u) => u.role === 'doctor'), [allUsers]);
  const coordinators = useMemo(() => allUsers.filter((u) => u.role === 'coordinator'), [allUsers]);
  // PIs + referring doctors (public accounts that signed up as a doctor).
  const allDoctorAccounts = useMemo(
    () => allUsers.filter((u) => u.role === 'doctor' || (u.role === 'user' && u.userType === 'doctor')),
    [allUsers],
  );

  // New accounts = real registrations (users/ docs) created inside the selected period. Not the
  // 'signup' usage events: those were only ever logged by the public sign-up form, so admin-created
  // and portal accounts were missing — and they went through the <5 k-anonymity mask meant for
  // patient search data. Account counts are internal, so they're shown exactly.
  const newAccounts = useMemo(() => {
    const since = periodStartMs ?? Number.POSITIVE_INFINITY;
    const byType = new Map<string, number>();
    let total = 0;
    for (const u of allUsers) {
      const label = accountTypeLabel(u);
      const created = timestampMs(u.createdAt);
      if (!label || created == null || created < since) continue;
      total += 1;
      byType.set(label, (byType.get(label) ?? 0) + 1);
    }
    return { total, breakdown: [...byType.entries()].sort((a, b) => b[1] - a[1]) };
  }, [allUsers, periodStartMs]);

  const visibleApprovedDoctors = useMemo(
    () => doctors.filter((d) => d.status === 'approved' && matchesSearch(piSearch, [d.name, d.facility, d.specialization, d.email])),
    [doctors, piSearch],
  );
  const visibleCoordinators = useMemo(
    () =>
      coordinators.filter((c) =>
        matchesSearch(coordSearch, [c.name, c.email, c.facility, c.city, c.requestedDoctorName, c.requestedDoctorEmail]),
      ),
    [coordinators, coordSearch],
  );
  useEffect(() => subscribeAllUserContacts(setContacts), []);
  useEffect(() => subscribeAuditLog(setAuditEntries), []);

  /** Public + private phones; public is only collected for PIs and doctors. */
  function phoneOf(uid: string) {
    const c = contacts.get(uid);
    if (!c?.phone && !c?.publicPhone) return '—';
    return (
      <>
        {c.publicPhone && <div>{c.publicPhone} <span className="sup">public</span></div>}
        {c.phone && <div>{c.phone} <span className="sup">private</span></div>}
      </>
    );
  }

  function flash(message: string) {
    setActionFeedback(message);
    setTimeout(() => setActionFeedback(null), 6000);
  }

  async function handlePromoteCoordinator(c: UserProfile) {
    if (!window.confirm(`Make ${c.name} (${c.email}) a Principal Investigator? They will be approved immediately.`)) return;
    setBusyDoctorUid(c.uid);
    try {
      await changeCoordinatorToPi(adminActor, c);
      flash(`${c.name} is now a verified Principal Investigator.`);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Failed to change role.');
    } finally {
      setBusyDoctorUid(null);
    }
  }

  async function handleReopen(c: ClosedTrial) {
    if (!window.confirm(`Reopen ${c.nctId} at ${c.facility}? It will appear in the active trial lists again.`)) return;
    try {
      await reopenTrial(c, adminActor);
      flash(`Reopened ${c.nctId} at ${c.facility}.`);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Failed to reopen trial.');
    }
  }

  useEffect(() => {
    return subscribeAllClaims(setClaims);
  }, []);

  const pendingDoctors = useMemo(() => doctors.filter((d) => d.status === 'pending'), [doctors]);
  const approvedDoctors = useMemo(() => doctors.filter((d) => d.status === 'approved'), [doctors]);
  const rejectedDoctors = useMemo(() => doctors.filter((d) => d.status === 'rejected'), [doctors]);

  const distinctHospitals = useMemo(() => {
    const set = new Set<string>();
    for (const d of approvedDoctors) {
      if (d.facility) set.add(d.facility.trim());
    }
    return set.size;
  }, [approvedDoctors]);

  async function handleApproveDoctor(d: UserProfile) {
    const { uid, name } = d;
    setBusyDoctorUid(uid);
    try {
      await authorizePi(d, { uid: user.uid, name: 'TrialWiz admin', email: user.email ?? '', role: 'admin' });
      setActionFeedback(`Approved Dr. ${name}. They can now access their dashboard and claim trials.`);
      setTimeout(() => setActionFeedback(null), 6000);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Failed to approve doctor.');
    } finally {
      setBusyDoctorUid(null);
    }
  }

  async function handleRejectDoctor(uid: string, name: string) {
    if (!window.confirm(`Are you sure you want to reject Dr. ${name}?`)) return;
    setBusyDoctorUid(uid);
    try {
      await rejectDoctor(uid);
      setActionFeedback(`Rejected Dr. ${name}.`);
      setTimeout(() => setActionFeedback(null), 6000);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Failed to reject doctor.');
    } finally {
      setBusyDoctorUid(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve(); // yield first so this setState never runs synchronously within the effect
      if (cancelled) return;
      setRecords(null);
      setUsageRecords(null);
      setError('');
      const sinceMs = Date.now() - periodDays * 86_400_000;
      setPeriodStartMs(sinceMs);
      try {
        const r = await fetchDemandRecords(sinceMs);
        if (!cancelled) setRecords(r);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load demand data.');
      }
      try {
        const u = await fetchUsageEvents(sinceMs);
        if (!cancelled) setUsageRecords(u);
      } catch (e) {
        if (!cancelled) console.warn('[TrialWiz] failed to load usage events:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [periodDays]);

  const agg = useMemo(() => (records ? aggregateDemand(records) : null), [records]);
  const usageAgg = useMemo(() => (usageRecords ? aggregateUsage(usageRecords) : null), [usageRecords]);

  const catalogue = useMemo(() => {
    const totalTrials = countUniqueTrials(catalogueRows);
    const submittedRows = catalogueRows.filter((r) => r.nctId.startsWith('TW-'));
    const centres = tallyByCentre(catalogueRows);
    return {
      totalTrials,
      submittedTrials: countUniqueTrials(submittedRows),
      byCancer: Object.entries(tallyByCancerType(catalogueRows)).sort((a, b) => b[1] - a[1]),
      byCentre: centres.slice(0, 10),
      centreCount: centres.length,
    };
  }, [catalogueRows]);

  function exportCsv() {
    if (!records) return;
    const blob = new Blob([toCsv(records)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trialwiz-demand-${periodDays}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportUsageCsv() {
    if (!usageRecords) return;
    const blob = new Blob([toUsageCsv(usageRecords)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trialwiz-usage-${periodDays}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    if (!agg) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(buildSponsorReportHtml(agg, periodDays));
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <div className="tw-admin">
      <AdminHeader
        right={
          <>
            <select className="period" value={periodDays} onChange={(e) => setPeriodDays(Number(e.target.value))}>
              {PERIODS.map(([d, label]) => (
                <option key={d} value={d}>
                  {label}
                </option>
              ))}
            </select>
            <span className="lockpill" onClick={() => auth && signOut(auth)}>
              <svg viewBox="0 0 24 24" fill="none">
                <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" />
              </svg>
              {user.email} · sign out
            </span>
          </>
        }
      />

      <div className="wrap">
        {error && (
          <div className="note" style={{ borderStyle: 'solid', background: 'var(--red-w)', color: 'var(--red)' }}>
            {error}
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="portal-tabs" style={{ marginBottom: 20 }}>
          <button
            className={`portal-tab ${adminTab === 'demand' ? 'active' : ''}`}
            onClick={() => setAdminTab('demand')}
          >
            📊 Demand Intelligence & Usage
          </button>
          <button
            className={`portal-tab ${adminTab === 'catalogue' ? 'active' : ''}`}
            onClick={() => setAdminTab('catalogue')}
          >
            🗂 Trial Catalogue ({catalogue.totalTrials})
          </button>
          <button
            className={`portal-tab ${adminTab === 'doctors' ? 'active' : ''}`}
            onClick={() => setAdminTab('doctors')}
          >
            🩺 Principal Investigator Accounts ({approvedDoctors.length})
            {pendingDoctors.length > 0 && (
              <span className="tab-pending-badge">{pendingDoctors.length}</span>
            )}
          </button>
          <button
            className={`portal-tab ${adminTab === 'closed' ? 'active' : ''}`}
            onClick={() => setAdminTab('closed')}
          >
            🗄 Closed Trials & Audit ({closedTrials.length})
          </button>
        </div>

        {/* TAB 1: DEMAND & USAGE INTELLIGENCE */}
        {adminTab === 'demand' && (
          <div>
            <div className="sechead2" style={{ marginTop: 0 }}>
              <h2>Demand Intelligence & Usage Analytics</h2>
              <span className="sup">Aggregate signals from patient & doctor searches on TrialWiz</span>
            </div>

            {!agg ? (
              <div className="note">Loading demand data…</div>
            ) : (
              <>
                <div className="kpis">
                  <div className="kpi">
                    <div className="n">{displayCount(agg.totalSearches)}</div>
                    <div className="l">Searches ({periodDays} days)</div>
                  </div>
                  <div className="kpi">
                    <div className="n">{displayCount(agg.distinctCities)}</div>
                    <div className="l">Cities / regions</div>
                  </div>
                  <div className="kpi">
                    <div className="n warn">{agg.zeroResultPct}%</div>
                    <div className="l">No matching trial</div>
                    <div className="d">unmet demand — the sellable signal</div>
                  </div>
                  <div className="kpi">
                    <div className="n">{displayCount(agg.distinctCancerTypes)}</div>
                    <div className="l">Cancer types searched</div>
                  </div>
                </div>

                <div className="cols">
                  <div className="card">
                    <h2>Top demand by cancer type</h2>
                    <Bars rows={agg.byCancer} />
                  </div>
                  <div className="card">
                    <h2>Top demand by location</h2>
                    <Bars rows={agg.byCity} />
                  </div>
                </div>

                <div className="card full">
                  <h2>Unmet demand — highest-value signal (searches with no site in range)</h2>
                  <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Cancer / setting</th>
                        <th>Region</th>
                        <th>Searches ({periodDays}d)</th>
                        <th>Priority</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agg.unmet.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="sup">
                            No unmet-demand searches recorded in this period.
                          </td>
                        </tr>
                      ) : (
                        agg.unmet.slice(0, 20).map((row) => {
                          const tag = priorityTag(row.searches);
                          return (
                            <tr key={`${row.cond}__${row.where}`}>
                              <td>
                                <b>{row.cond}</b>
                              </td>
                              <td>{row.where}</td>
                              <td className="gap">{displayCount(row.searches)}</td>
                              <td>
                                <span className={`tag ${tag.cls}`}>{tag.label}</span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                  </div>
                  <div className="note" style={{ marginTop: 14 }}>
                    <b>How to read this.</b> Each row is a place where patients (or their oncologists) are actively
                    looking for a trial with no recruiting site in range. For a sponsor planning an India arm, this is a
                    demand-led site-selection input. Cells below 5 searches are shown as <code>&lt;5</code> — see the
                    guardrail note below.
                  </div>
                </div>

                <div className="card full">
                  <h2>Demand by therapy setting</h2>
                  <Bars rows={agg.bySetting} />
                </div>

                <div className="sechead2">
                  <h2>Usage activity</h2>
                  <span className="sup">Auto-collected: searches, browse taps, location changes, trial-card clicks, sign-ups, favorites</span>
                </div>
                {!usageAgg ? (
                  <div className="note">Loading usage data…</div>
                ) : (
                  <>
                    <div className="kpis">
                      <div className="kpi">
                        <div className="n">{displayCount(usageAgg.totalEvents)}</div>
                        <div className="l">Events ({periodDays} days)</div>
                      </div>
                      <div className="kpi">
                        <div className="n">{newAccounts.total.toLocaleString()}</div>
                        <div className="l">New accounts ({periodDays} days)</div>
                        <div className="d">
                          {newAccounts.breakdown.length
                            ? newAccounts.breakdown.map(([k, v]) => `${v} ${k.toLowerCase()}`).join(' · ')
                            : 'No registrations in this period'}
                        </div>
                      </div>
                      <div className="kpi">
                        <div className="n">{displayCount(usageAgg.signins)}</div>
                        <div className="l">Sign-ins</div>
                      </div>
                      <div className="kpi">
                        <div className="n">{displayCount(usageAgg.favorites)}</div>
                        <div className="l">Favorite toggles</div>
                      </div>
                    </div>

                    <div className="cols">
                      <div className="card">
                        <h2>Activity by type</h2>
                        <Bars rows={usageAgg.byType} />
                      </div>
                      <div className="card">
                        <h2>Top browsed (cancer type / centre)</h2>
                        <Bars rows={usageAgg.topBrowsed} />
                      </div>
                    </div>
                    <div className="cols">
                      <div className="card">
                        <h2>Top trial-card clicks</h2>
                        <Bars rows={usageAgg.topClicked} />
                      </div>
                      <div className="card">
                        <h2>Top location changes</h2>
                        <Bars rows={usageAgg.topLocations} />
                      </div>
                    </div>
                  </>
                )}

                <div className="note">
                  <b>Guardrails baked in.</b> Aggregate counts and geographies only — no patient identity, no phone
                  number, no linkage to a person, ever. <b>k-anonymity:</b> any cell smaller than <code>5</code> is
                  suppressed and shown as "&lt;5". This dashboard lives behind Firebase Auth + a Firestore{' '}
                  <code>admins</code> allowlist; the public app never reads this collection, only writes to it.
                </div>

                <div className="actions">
                  <button className="btn primary" onClick={exportPdf} disabled={!records || records.length === 0}>
                    Generate sponsor report (PDF)
                  </button>
                  <button className="btn" onClick={exportCsv} disabled={!records || records.length === 0}>
                    Export aggregate dataset (CSV)
                  </button>
                  <button className="btn" onClick={exportUsageCsv} disabled={!usageRecords || usageRecords.length === 0}>
                    Export usage events (CSV)
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 2: TRIAL CATALOGUE */}
        {adminTab === 'catalogue' && (
          <div>
            <div className="sechead2" style={{ marginTop: 0 }}>
              <h2>Trial catalogue</h2>
              <span className="sup">
                Live from ClinicalTrials.gov + doctor/coordinator submissions — updates automatically, no refresh needed
              </span>
            </div>
            {catalogueLoading && catalogueRows.length === 0 ? (
              <div className="note">Loading trial catalogue…</div>
            ) : (
              <>
                <div className="kpis">
                  <div className="kpi">
                    <div className="n">{catalogue.totalTrials}</div>
                    <div className="l">Total recruiting trials</div>
                  </div>
                  <div className="kpi">
                    <div className="n">{catalogue.centreCount}</div>
                    <div className="l">Distinct centres</div>
                  </div>
                  <div className="kpi">
                    <div className="n">{catalogue.submittedTrials}</div>
                    <div className="l">Coordinator-submitted</div>
                  </div>
                </div>
                <div className="cols">
                  <div className="card">
                    <h2>Trials by cancer type</h2>
                    <Bars rows={catalogue.byCancer} mask={false} emptyLabel="No trials in the catalogue yet." />
                  </div>
                  <div className="card">
                    <h2>Top centres by trial count</h2>
                    <Bars
                      rows={catalogue.byCentre.map((c) => [`${c.facility}, ${c.city}`, c.count] as [string, number])}
                      mask={false}
                      emptyLabel="No centres in the catalogue yet."
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 3: DOCTORS & PI APPROVALS */}
        {adminTab === 'doctors' && (
          <div>
            <div className="admin-section-head">
              <div>
                <h2 style={{ fontSize: 18, margin: 0, fontWeight: 780 }}>
                  Principal Investigator & Doctor Accounts
                </h2>
                <p className="sup" style={{ margin: '4px 0 0' }}>
                  Approve self-registered PIs, change roles, and create pre-approved accounts for any role
                </p>
              </div>
              <button
                className="btn primary"
                onClick={() => setCreateDoctorOpen(true)}
                style={{ marginLeft: 'auto' }}
              >
                ➕ Create Account
              </button>
            </div>

            {actionFeedback && (
              <div className="note" style={{ background: '#e3f7e9', color: '#16794b', borderColor: '#a3e6b7' }}>
                ✓ {actionFeedback}
              </div>
            )}

            {/* KPIs */}
            <div className="kpis" style={{ marginTop: 16 }}>
              <div className="kpi">
                <div className={`n ${pendingDoctors.length > 0 ? 'warn' : ''}`}>{pendingDoctors.length}</div>
                <div className="l">Pending Approvals</div>
                <div className="d">{pendingDoctors.length > 0 ? 'Action required' : 'All clear'}</div>
              </div>
              <div className="kpi">
                <div className="n">{approvedDoctors.length}</div>
                <div className="l">Verified Doctors (PIs)</div>
              </div>
              <div className="kpi">
                <div className="n">{distinctHospitals}</div>
                <div className="l">Affiliated Hospitals</div>
              </div>
              <div className="kpi">
                <div className="n">{claims.length}</div>
                <div className="l">Claimed Trials</div>
              </div>
            </div>

            {/* PENDING APPROVALS */}
            <div className="sechead2">
              <h2>Pending Doctor Approvals ({pendingDoctors.length})</h2>
              <span className="sup">Doctors who registered via provider portal and await site verification</span>
            </div>
            <div className="card full">
              {pendingDoctors.length === 0 ? (
                <div className="sup">No pending doctor approvals right now. All registrations are processed!</div>
              ) : (
                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Doctor Name</th>
                        <th>Hospital / Institution</th>
                        <th>Location</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingDoctors.map((d) => (
                        <tr key={d.uid}>
                          <td><b>{d.name}</b></td>
                          <td>{d.facility || '—'}</td>
                          <td>{[d.city, d.state].filter(Boolean).join(', ') || '—'}</td>
                          <td><a href={`mailto:${d.email}`}>{d.email}</a></td>
                          <td>{phoneOf(d.uid)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                              <button
                                className="btn primary"
                                style={{ padding: '6px 12px', fontSize: 12 }}
                                disabled={busyDoctorUid === d.uid}
                                onClick={() => handleApproveDoctor(d)}
                              >
                                {busyDoctorUid === d.uid ? '…' : 'Approve'}
                              </button>
                              <button
                                className="btn"
                                style={{ padding: '6px 12px', fontSize: 12, color: 'var(--red)' }}
                                disabled={busyDoctorUid === d.uid}
                                onClick={() => handleRejectDoctor(d.uid, d.name)}
                              >
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <AllDoctorsSection doctors={allDoctorAccounts} phoneOf={phoneOf} />

            {/* VERIFIED PRINCIPAL INVESTIGATORS */}
            <div className="sechead2">
              <h2>Verified Principal Investigators ({approvedDoctors.length})</h2>
              <span className="sup">Authorized to claim trials, add site contacts, approve coordinators, and authorize PIs at their hospital</span>
            </div>
            <div className="card full">
              {approvedDoctors.length > 0 && (
                <div className="admin-search-row">
                  <input
                    type="search"
                    className="claim-input"
                    value={piSearch}
                    onChange={(e) => setPiSearch(e.target.value)}
                    placeholder="Search verified PIs by name, hospital or specialization…"
                    aria-label="Search verified Principal Investigators"
                  />
                </div>
              )}
              {approvedDoctors.length === 0 ? (
                <div className="sup">No approved doctor accounts yet. Use the "+ Create Account" button above to add one.</div>
              ) : visibleApprovedDoctors.length === 0 ? (
                <div className="sup">No verified Principal Investigators match "{piSearch}".</div>
              ) : (
                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Doctor Name</th>
                        <th>Hospital / Institution</th>
                        <th>Specialization</th>
                        <th>Location</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Management</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleApprovedDoctors.map((d) => (
                        <tr key={d.uid}>
                          <td><b>{d.name}</b></td>
                          <td>{d.facility || '—'}</td>
                          <td>{d.specialization || '—'}</td>
                          <td>{[d.city, d.state].filter(Boolean).join(', ') || '—'}</td>
                          <td>{d.email}</td>
                          <td>{phoneOf(d.uid)}</td>
                          <td><span className="pill approved">Approved</span></td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                              <button
                                className="btn"
                                style={{ padding: '4px 10px', fontSize: 11.5 }}
                                disabled={busyDoctorUid === d.uid}
                                onClick={() => setRoleChangeTarget(d)}
                                title="Change this account's role to Trial Coordinator"
                              >
                                Change to Coordinator
                              </button>
                              <button
                                className="btn"
                                style={{ padding: '4px 10px', fontSize: 11.5 }}
                                disabled={busyDoctorUid === d.uid}
                                onClick={() => handleRejectDoctor(d.uid, d.name)}
                              >
                                Revoke
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* REJECTED DOCTORS */}
            {rejectedDoctors.length > 0 && (
              <>
                <div className="sechead2">
                  <h2>Rejected Doctor Registrations ({rejectedDoctors.length})</h2>
                </div>
                <div className="card full">
                  <div className="tablewrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Doctor Name</th>
                          <th>Hospital / Institution</th>
                          <th>Email</th>
                          <th style={{ textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rejectedDoctors.map((d) => (
                          <tr key={d.uid}>
                            <td><b>{d.name}</b></td>
                            <td>{d.facility || '—'}</td>
                            <td>{d.email}</td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                className="btn"
                                style={{ padding: '4px 10px', fontSize: 11.5 }}
                                disabled={busyDoctorUid === d.uid}
                                onClick={() => handleApproveDoctor(d)}
                              >
                                Approve instead
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* TRIAL COORDINATORS */}
            <div className="sechead2">
              <h2>Trial Coordinators ({coordinators.length})</h2>
              <span className="sup">
                Coordinators are approved by their Principal Investigator. Admins can promote a coordinator to PI.
              </span>
            </div>
            <div className="card full">
              {coordinators.length > 0 && (
                <div className="admin-search-row">
                  <input
                    type="search"
                    className="claim-input"
                    value={coordSearch}
                    onChange={(e) => setCoordSearch(e.target.value)}
                    placeholder="Search coordinators by name, email, hospital or PI…"
                    aria-label="Search trial coordinators"
                  />
                </div>
              )}
              {coordinators.length === 0 ? (
                <div className="sup">No trial coordinator accounts yet.</div>
              ) : visibleCoordinators.length === 0 ? (
                <div className="sup">No trial coordinators match "{coordSearch}".</div>
              ) : (
                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Principal Investigator</th>
                        <th>Hospital</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Management</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleCoordinators.map((c) => (
                        <tr key={c.uid}>
                          <td><b>{c.name}</b></td>
                          <td>{c.requestedDoctorName || c.requestedDoctorEmail || '—'}</td>
                          <td>{c.facility || '—'}</td>
                          <td>{c.email}</td>
                          <td>{phoneOf(c.uid)}</td>
                          <td>
                            <span className={`pill ${c.status ?? 'pending'}`}>{c.status ?? 'pending'}</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="btn"
                              style={{ padding: '4px 10px', fontSize: 11.5 }}
                              disabled={busyDoctorUid === c.uid}
                              onClick={() => handlePromoteCoordinator(c)}
                            >
                              Make Principal Investigator
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* PI AUTHORIZATION HISTORY */}
            <div className="sechead2">
              <h2>PI authorization history ({authHistory.length})</h2>
              <span className="sup">
                Who verified each Principal Investigator and when — TrialWiz admin, or a verified PI at the same hospital
              </span>
            </div>
            <div className="card full">
              {authHistory.length === 0 ? (
                <div className="sup">No authorizations recorded yet.</div>
              ) : (
                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Principal Investigator</th>
                        <th>Hospital</th>
                        <th>Authorized by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {authHistory.map((h) => (
                        <tr key={h.id}>
                          <td>{formatTimestamp(h.authorizedAt)}</td>
                          <td>
                            <b>{h.piName}</b>
                            <div className="sup">{h.piEmail}</div>
                          </td>
                          <td>{h.hospital || '—'}</td>
                          <td>
                            {h.authorizedByRole === 'admin' ? 'TrialWiz admin' : `PI · ${h.authorizedByName}`}
                            <div className="sup">{h.authorizedByEmail}</div>
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

        {/* TAB 4: CLOSED TRIAL REPOSITORY + AUDIT TRAIL */}
        {adminTab === 'closed' && (
          <div>
            {actionFeedback && (
              <div className="note" style={{ background: '#e3f7e9', color: '#16794b', borderColor: '#a3e6b7' }}>
                ✓ {actionFeedback}
              </div>
            )}
            <div className="sechead2" style={{ marginTop: 0 }}>
              <h2>Closed trial repository ({closedTrials.length})</h2>
              <span className="sup">
                Trial sites a Principal Investigator marked closed — hidden from every active list
              </span>
            </div>
            <div className="card full">
              {closedTrials.length === 0 ? (
                <div className="sup">No trials have been closed yet.</div>
              ) : (
                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Trial</th>
                        <th>Site</th>
                        <th>Closed by</th>
                        <th>Closed on</th>
                        <th>Reason</th>
                        <th style={{ textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {closedTrials.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <b>{c.nctId}</b>
                            {c.briefTitle && <div className="sup">{c.briefTitle}</div>}
                          </td>
                          <td>{[c.facility, c.city].filter(Boolean).join(', ')}</td>
                          <td>
                            {c.closedByName}
                            <div className="sup">{c.closedByEmail}</div>
                          </td>
                          <td>{formatTimestamp(c.closedAt)}</td>
                          <td>{c.reason || '—'}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button className="btn" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => handleReopen(c)}>
                              Reopen
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="sechead2">
              <h2>Audit trail</h2>
              <span className="sup">Trial closures, reopenings and role changes — append-only, newest first</span>
            </div>
            <div className="card full">
              {auditEntries.length === 0 ? (
                <div className="sup">No audited actions yet.</div>
              ) : (
                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Action</th>
                        <th>By</th>
                        <th>Subject</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditEntries.map((a) => (
                        <tr key={a.id}>
                          <td>{formatTimestamp(a.at)}</td>
                          <td>{AUDIT_LABEL[a.action] ?? a.action}</td>
                          <td>{a.actorName ? `${a.actorName} · ${a.actorEmail}` : a.actorEmail}</td>
                          <td>{a.target}</td>
                          <td>{a.details || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {roleChangeTarget && (
        <ChangeRoleModal
          admin={adminActor}
          pi={roleChangeTarget}
          approvedPis={approvedDoctors}
          linkedCoordinatorCount={
            coordinators.filter(
              (c) => (c.requestedDoctorEmail ?? '').toLowerCase() === roleChangeTarget.email.toLowerCase(),
            ).length
          }
          onClose={() => setRoleChangeTarget(null)}
          onChanged={flash}
        />
      )}

      {createDoctorOpen && (
        <CreateAccountModal
          admin={adminActor}
          approvedPis={approvedDoctors}
          onClose={() => setCreateDoctorOpen(false)}
          onCreated={flash}
        />
      )}
    </div>
  );
}
