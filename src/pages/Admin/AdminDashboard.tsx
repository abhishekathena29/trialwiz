import { signOut, type User } from 'firebase/auth';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  aggregateDemand,
  aggregateUsage,
  displayCount,
  fetchDemandRecords,
  fetchUsageEvents,
  whereLabel,
  type DemandAggregate,
  type DemandRecord,
  type UsageRecord,
} from '../../analytics/aggregate';
import { ChangePasswordModal } from '../../components/ChangePasswordModal';
import { EditAccountModal } from '../../components/EditAccountModal';
import { auth } from '../../firebase';
import { useTrialCatalogue } from '../../hooks/useTrialCatalogue';
import { useClosedTrials } from '../../hooks/useClosedTrials';
import { subscribeAuditLog } from '../../services/audit';
import { subscribeAdminContacts, type AdminContactMark } from '../../services/adminContacts';
import { reopenTrial, siteCloseId, type CloseTarget } from '../../services/closedTrials';
import { claimMatchesSite } from '../../services/trialClaims';
import { CloseTrialModal } from '../Portal/CloseTrialModal';
import { authorizePi, subscribeAllPiAuthorizations } from '../../services/piAuthorization';
import {
  changeCoordinatorToPi,
  rejectDoctor,
  subscribeAllUserContacts,
  subscribeAllUsers,
} from '../../services/profiles';
import { subscribeAllTeamApprovals } from '../../services/teamApprovals';
import { subscribeAllClaims } from '../../services/trialClaims';
import {
  ROLE_LABEL,
  type AuditEntry,
  type ClosedTrial,
  type PiAuthorization,
  type TeamApproval,
  type TrialClaim,
  type UserContact,
  type UserProfile,
} from '../../types';
import { formatTimestamp, timestampMs } from '../../utils/timestamps';
import { matchesSearch } from '../../utils/search';
import { AllDoctorsSection } from './AllDoctorsSection';
import { countUniqueTrials, tallyByCancerType, tallyByCentre } from '../../utils/trialStats';
import { AdminHeader } from './AdminHeader';
import { ChangeRoleModal } from './ChangeRoleModal';
import { ContactedCell } from './ContactedCell';
import { CreateAccountModal } from './CreateAccountModal';
import { DeleteAccountModal } from './DeleteAccountModal';
import { ClaimedAddedSection, type EditTarget } from './ClaimedAddedSection';
import { SiteFormModal } from '../Portal/SiteFormModal';
import { updateAddedSite, type SiteFields } from '../../services/addedSites';
import { updateSubmittedTrialSite } from '../../services/trialSubmissions';
import { writeAudit } from '../../services/audit';
import { subscribeAddedSites } from '../../services/addedSites';
import { subscribeAllSubmittedTrials } from '../../services/trialSubmissions';
import type { AddedSite, SubmittedTrial } from '../../types';
import { IndividualsSection } from './IndividualsSection';
import { MergeAccountsModal } from './MergeAccountsModal';
import { dismissMergeRequest, subscribeMergeRequests } from '../../services/accountMerge';
import type { MergeRequest } from '../../types';

const AUDIT_LABEL: Record<string, string> = {
  trial_closed: 'Trial closed',
  trial_reopened: 'Trial reopened',
  role_changed: 'Role changed',
  pi_authorized: 'PI authorized',
  team_member_decided: 'Team member approved / rejected',
  account_edited: 'Account edited',
  account_deleted: 'Account deleted',
  accounts_merged: 'Accounts merged',
  trial_edited: 'Trial details corrected',
};

type PeopleTab = 'all' | 'pis' | 'trialDoctors' | 'coordinators' | 'individuals' | 'history';

/** Labels for the New-accounts breakdown. Admin accounts aren't counted as registrations. */
function accountTypeLabel(u: UserProfile): string | null {
  if (u.role === 'doctor') return u.piTitle === 'trialDoctor' ? 'Trial team doctors' : 'Principal Investigators';
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

/** A KPI tile that opens a drill-down list. */
function KpiButton({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  // `active` undefined = the tile navigates (to an accounts sub-tab) rather than opening a list.
  const hint = active === undefined ? 'open list ›' : active ? 'hide list ▴' : 'view list ▾';
  return (
    <button type="button" className={`kpi clickable${active ? ' active' : ''}`} onClick={onClick} aria-expanded={active}>
      {children}
      <div className="kpi-more">{hint}</div>
    </button>
  );
}

function DrillPanel({ title, note, onClose, children }: { title: string; note?: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="card full drill">
      <div className="drill-head">
        <h2>{title}</h2>
        <button type="button" className="btn" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={onClose}>
          ✕ Close
        </button>
      </div>
      {note && <p className="sup" style={{ marginTop: -6 }}>{note}</p>}
      {children}
    </div>
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

  const [adminTab, setAdminTab] = useState<'demand' | 'catalogue' | 'doctors' | 'activity' | 'closed'>('demand');
  // Who claimed / added what — the "Claimed & Added Trials" tab.
  const [allSubmitted, setAllSubmitted] = useState<SubmittedTrial[]>([]);
  const [allAddedSites, setAllAddedSites] = useState<AddedSite[]>([]);
  useEffect(() => subscribeAllSubmittedTrials(setAllSubmitted), []);
  useEffect(() => subscribeAddedSites(setAllAddedSites), []);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [claims, setClaims] = useState<TrialClaim[]>([]);
  /** Claimed + newly added trials + added locations — one number on the tab and the KPI. */
  const claimedAddedTotal = claims.length + allSubmitted.length + allAddedSites.length;
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
  const [peopleTab, setPeopleTab] = useState<PeopleTab>('all');
  const [editTarget, setEditTarget] = useState<UserProfile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null);
  const [teamLog, setTeamLog] = useState<TeamApproval[]>([]);
  const [pendingSearch, setPendingSearch] = useState('');
  const [pwOpen, setPwOpen] = useState(false);
  const [adminClose, setAdminClose] = useState<{ id: string; target: CloseTarget } | null>(null);
  const [trialEdit, setTrialEdit] = useState<EditTarget | null>(null);
  const [mergeDialog, setMergeDialog] = useState<{ keep?: UserProfile; dup?: UserProfile; requestId?: string } | null>(null);
  const [mergeRequests, setMergeRequests] = useState<MergeRequest[]>([]);
  useEffect(() => subscribeMergeRequests(setMergeRequests), []);
  const pendingMerges = useMemo(() => mergeRequests.filter((r) => r.status === 'pending' && r.dupConfirmed), [mergeRequests]);
  type DemandDrill = 'searches' | 'cities' | 'unmet' | 'cancers';
  const [demandDrill, setDemandDrill] = useState<DemandDrill | null>(null);
  const toggleDemandDrill = (d: DemandDrill) => setDemandDrill((cur) => (cur === d ? null : d));
  type AccountsDrill = 'hospitals' | 'claims';
  const [accountsDrill, setAccountsDrill] = useState<AccountsDrill | null>(null);
  const toggleAccountsDrill = (d: AccountsDrill) => setAccountsDrill((cur) => (cur === d ? null : d));
  const peopleTabsRef = useRef<HTMLDivElement | null>(null);
  /** Jump to an accounts sub-tab (e.g. from a KPI tile) and bring it into view. */
  function goPeopleTab(t: PeopleTab) {
    setPeopleTab(t);
    setAccountsDrill(null);
    setTimeout(() => peopleTabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }
  const [contactMarks, setContactMarks] = useState<Map<string, AdminContactMark>>(new Map());
  useEffect(() => subscribeAdminContacts(setContactMarks), []);
  const contactedCell = (uid: string) => <ContactedCell uid={uid} mark={contactMarks.get(uid)} adminEmail={user.email ?? ''} />;
  const rowCls = (uid: string) => (contactMarks.get(uid)?.contacted ? 'row-contacted' : undefined);
  const closedTrials = useClosedTrials();
  const adminActor = useMemo(() => ({ uid: user.uid, email: user.email ?? '', name: 'TrialWiz admin' }), [user]);

  useEffect(() => subscribeAllUsers(setAllUsers), []);
  useEffect(() => subscribeAllPiAuthorizations(setAuthHistory), []);
  useEffect(() => subscribeAllTeamApprovals(setTeamLog), []);

  const doctors = useMemo(() => allUsers.filter((u) => u.role === 'doctor'), [allUsers]);
  const coordinators = useMemo(() => allUsers.filter((u) => u.role === 'coordinator'), [allUsers]);
  // Trial Team Doctors are role 'doctor' accounts (every PI feature) with a different label.
  const trialDoctors = useMemo(() => doctors.filter((u) => u.piTitle === 'trialDoctor'), [doctors]);
  const piOnly = useMemo(() => doctors.filter((u) => u.piTitle !== 'trialDoctor'), [doctors]);
  // PIs + trial team doctors + referring doctors (public accounts that signed up as a doctor).
  const allDoctorAccounts = useMemo(
    () => allUsers.filter((u) => u.role === 'doctor' || (u.role === 'user' && u.userType === 'doctor')),
    [allUsers],
  );
  // Public accounts that signed up as an individual (or before the type was recorded).
  const individuals = useMemo(() => allUsers.filter((u) => u.role === 'user' && u.userType !== 'doctor'), [allUsers]);
  /** The Principal Investigators and Trial Doctors sub-tabs share one view, filtered by label. */
  const ofShownKind = (d: UserProfile) => (peopleTab === 'trialDoctors' ? d.piTitle === 'trialDoctor' : d.piTitle !== 'trialDoctor');
  const kindLabel = peopleTab === 'trialDoctors' ? 'Trial Team Doctors' : 'Principal Investigators';

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
    () => doctors.filter((d) => d.status === 'approved' && matchesSearch(piSearch, [d.name, d.facility, d.specialization, d.email, d.city, d.state])),
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
    if (!window.confirm(`Make ${c.name} (${c.email}) — currently a ${ROLE_LABEL[c.role] ?? c.role} — a Principal Investigator? They will be approved immediately.`)) return;
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
  const visiblePendingDoctors = useMemo(
    () => pendingDoctors.filter((d) => matchesSearch(pendingSearch, [d.name, d.email, d.facility, d.city, d.specialization])),
    [pendingDoctors, pendingSearch],
  );
  const approvedDoctors = useMemo(() => doctors.filter((d) => d.status === 'approved'), [doctors]);
  const rejectedDoctors = useMemo(() => doctors.filter((d) => d.status === 'rejected'), [doctors]);

  const distinctHospitals = useMemo(() => {
    const set = new Set<string>();
    for (const d of approvedDoctors) {
      if (d.facility) set.add(d.facility.trim());
    }
    return set.size;
  }, [approvedDoctors]);

  const hospitalList = useMemo(() => {
    const byName = new Map<string, { name: string; city: string; people: UserProfile[] }>();
    for (const d of approvedDoctors) {
      const name = d.facility?.trim();
      if (!name) continue;
      const k = name.toLowerCase();
      if (!byName.has(k)) byName.set(k, { name, city: d.city ?? '', people: [] });
      byName.get(k)!.people.push(d);
    }
    return [...byName.values()].sort((a, b) => b.people.length - a.people.length || a.name.localeCompare(b.name));
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
    if (!window.confirm(`Reject / revoke Dr. ${name}? They lose portal access. If they signed up as the wrong kind of account, they can sign up again with the same email and the right role.`)) return;
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

  /** Shared table for the two kinds of team member — trial team doctors and coordinators. */
  function renderTeamTable(t: {
    title: string;
    blurb: string;
    members: UserProfile[];
    visible: UserProfile[];
    search: string;
    setSearch: (v: string) => void;
    placeholder: string;
  }) {
    return (
      <>
        <div className="sechead2">
          <h2>
            {t.title} ({t.members.length})
          </h2>
          <span className="sup">{t.blurb}</span>
        </div>
        <div className="card full">
          {t.members.length > 0 && (
            <div className="admin-search-row">
              <input
                type="search"
                className="claim-input"
                value={t.search}
                onChange={(e) => t.setSearch(e.target.value)}
                placeholder={t.placeholder}
                aria-label={`Search ${t.title}`}
              />
            </div>
          )}
          {t.members.length === 0 ? (
            <div className="sup">No {t.title.toLowerCase()} yet.</div>
          ) : t.visible.length === 0 ? (
            <div className="sup">
              No {t.title.toLowerCase()} match "{t.search}".
            </div>
          ) : (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Contacted</th>
                    <th>Name</th>
                    <th>Principal Investigator</th>
                    <th>Hospital</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Approved by</th>
                    <th style={{ textAlign: 'right' }}>Management</th>
                  </tr>
                </thead>
                <tbody>
                  {t.visible.map((c) => {
                    const decision = teamLog.find((h) => h.memberUid === c.uid);
                    return (
                      <tr key={c.uid} className={rowCls(c.uid)}>
                        <td>{contactedCell(c.uid)}</td>
                        <td>
                          <b>{c.name}</b>
                          {c.specialization && <div className="sup">{c.specialization}</div>}
                        </td>
                        <td>{c.requestedDoctorName || c.requestedDoctorEmail || '—'}</td>
                        <td>{c.facility || '—'}</td>
                        <td>{c.email}</td>
                        <td>{phoneOf(c.uid)}</td>
                        <td>
                          <span className={`pill ${c.status ?? 'pending'}`}>{c.status ?? 'pending'}</span>
                        </td>
                        <td>
                          {decision ? (
                            <>
                              {decision.decidedByRole === 'admin' ? 'TrialWiz admin' : decision.decidedByName}
                              <div className="sup">
                                {decision.decision} · {formatTimestamp(decision.decidedAt)}
                              </div>
                            </>
                          ) : c.status === 'approved' ? (
                            <span className="sup">Before the log was kept</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <button className="btn" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => setEditTarget(c)}>
                              Edit
                            </button>
                            <button
                              className="btn"
                              style={{ padding: '4px 10px', fontSize: 11.5 }}
                              disabled={busyDoctorUid === c.uid}
                              onClick={() => handlePromoteCoordinator(c)}
                            >
                              Make Principal Investigator
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    );
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
    const allCentres = tallyByCentre(catalogueRows);
    // Sponsor-masked "Research Site" / "Local Institution" rows aren't identifiable centres.
    const centres = allCentres.filter((c) => !c.placeholder);
    return {
      placeholderCentres: allCentres.length - centres.length,
      totalTrials,
      submittedTrials: countUniqueTrials(submittedRows),
      byCancer: Object.entries(tallyByCancerType(catalogueRows)).sort((a, b) => b[1] - a[1]),
      byCentre: centres.slice(0, 10),
      centreCount: centres.length,
    };
  }, [catalogueRows]);

  const [closeSearch, setCloseSearch] = useState('');
  const { closeMatches, closeMatchesTotal } = useMemo(() => {
    const q = closeSearch.trim().toLowerCase();
    if (q.length < 3) return { closeMatches: [], closeMatchesTotal: 0 };
    const all = catalogueRows.filter((r) =>
      `${r.nctId} ${r.briefTitle} ${r.facility} ${r.city} ${r.contactName ?? ''}`.toLowerCase().includes(q),
    );
    return { closeMatches: all.slice(0, 60), closeMatchesTotal: all.length };
  }, [closeSearch, catalogueRows]);

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
            <span className="lockpill" onClick={() => setPwOpen(true)} title="Change your admin password">
              🔑 change password
            </span>
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
            👥 Accounts — Doctors, PIs, Teams & Individuals
            {pendingDoctors.length > 0 && (
              <span className="tab-pending-badge">{pendingDoctors.length}</span>
            )}
          </button>
          <button
            className={`portal-tab ${adminTab === 'activity' ? 'active' : ''}`}
            onClick={() => setAdminTab('activity')}
          >
            🛡 Claimed & Added Trials ({claimedAddedTotal})
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
                  <KpiButton active={demandDrill === 'searches'} onClick={() => toggleDemandDrill('searches')}>
                    <div className="n">{displayCount(agg.totalSearches)}</div>
                    <div className="l">Searches ({periodDays} days)</div>
                  </KpiButton>
                  <KpiButton active={demandDrill === 'cities'} onClick={() => toggleDemandDrill('cities')}>
                    <div className="n">{displayCount(agg.distinctCities)}</div>
                    <div className="l">Cities / regions</div>
                  </KpiButton>
                  <KpiButton active={demandDrill === 'unmet'} onClick={() => toggleDemandDrill('unmet')}>
                    <div className="n warn">{agg.zeroResultPct}%</div>
                    <div className="l">No matching trial</div>
                    <div className="d">unmet demand — the sellable signal</div>
                  </KpiButton>
                  <KpiButton active={demandDrill === 'cancers'} onClick={() => toggleDemandDrill('cancers')}>
                    <div className="n">{displayCount(agg.distinctCancerTypes)}</div>
                    <div className="l">Cancer types searched</div>
                  </KpiButton>
                </div>

                {demandDrill === 'searches' && records && (
                  <DrillPanel title={`Latest searches (${Math.min(records.length, 100)} of ${records.length})`} onClose={() => setDemandDrill(null)}>
                    <div className="tablewrap">
                      <table>
                        <thead>
                          <tr>
                            <th>When</th>
                            <th>Cancer type</th>
                            <th>Location</th>
                            <th>Setting</th>
                            <th>Results</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...records]
                            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                            .slice(0, 100)
                            .map((r) => (
                              <tr key={r.id}>
                                <td>{r.createdAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                                <td>{r.cond}</td>
                                <td>{whereLabel(r.where)}</td>
                                <td>{r.line === 'any' ? '—' : r.line}</td>
                                <td className={r.resultCount === 0 ? 'gap' : undefined}>{r.resultCount}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </DrillPanel>
                )}
                {demandDrill === 'cities' && (
                  <DrillPanel
                    title={`Every location searched (${agg.allCities.length})`}
                    note={`The headline counts real cities, regions and centres only (${agg.distinctCities}). Searches with no location set, or "All India", are listed but not counted as a place.`}
                    onClose={() => setDemandDrill(null)}
                  >
                    <Bars rows={agg.allCities} />
                  </DrillPanel>
                )}
                {demandDrill === 'cancers' && (
                  <DrillPanel title={`Every cancer type searched (${agg.allCancers.length})`} onClose={() => setDemandDrill(null)}>
                    <Bars rows={agg.allCancers} />
                  </DrillPanel>
                )}
                {demandDrill === 'unmet' && records && (
                  <DrillPanel
                    title={`Searches with no matching trial (${records.filter((r) => r.resultCount === 0).length} of ${records.length})`}
                    note="Every search that returned zero trials, newest first — what people looked for and where."
                    onClose={() => setDemandDrill(null)}
                  >
                    <div className="tablewrap">
                      <table>
                        <thead>
                          <tr>
                            <th>When</th>
                            <th>Cancer type</th>
                            <th>Location</th>
                            <th>Setting</th>
                            <th>Spread</th>
                            <th>Biomarker</th>
                          </tr>
                        </thead>
                        <tbody>
                          {records
                            .filter((r) => r.resultCount === 0)
                            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                            .map((r) => (
                              <tr key={r.id}>
                                <td>{r.createdAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                                <td><b>{r.cond}</b></td>
                                <td>{whereLabel(r.where)}</td>
                                <td>{r.line === 'any' ? '—' : r.line}</td>
                                <td>{r.met === 'any' ? '—' : r.met}</td>
                                <td>{r.bio || '—'}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </DrillPanel>
                )}

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
                    {catalogue.placeholderCentres > 0 && (
                      <div className="sup" style={{ marginTop: 10 }}>
                        Leaves out {catalogue.placeholderCentres} sponsor-masked sites ("Research Site", "Local
                        Institution", "GSK Investigational Site"…) — the registry doesn't publish which hospital they are.
                      </div>
                    )}
                  </div>
                </div>

                <div className="sechead2">
                  <h2>Find &amp; close a trial</h2>
                  <span className="sup">Admin can close any trial site — claimed or not. It moves to Closed Trials &amp; Audit, where it can be reopened.</span>
                </div>
                {actionFeedback && (
                  <div className="note" style={{ background: '#e3f7e9', color: '#16794b', borderColor: '#a3e6b7' }}>
                    ✓ {actionFeedback}
                  </div>
                )}
                <div className="card full">
                  <div className="admin-search-row">
                    <input
                      type="search"
                      className="claim-input"
                      value={closeSearch}
                      onChange={(e) => setCloseSearch(e.target.value)}
                      placeholder="Search by NCT / CTRI id, title, hospital, city or investigator…"
                      aria-label="Search trials to close"
                    />
                  </div>
                  {closeSearch.trim().length < 3 ? (
                    <div className="sup">Type at least 3 characters to find a trial.</div>
                  ) : closeMatches.length === 0 ? (
                    <div className="sup">No active trial matches "{closeSearch}".</div>
                  ) : (
                    <div className="tablewrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Trial</th>
                            <th>Site</th>
                            <th>Contact</th>
                            <th style={{ textAlign: 'right' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {closeMatches.map((r) => {
                            const claim = claims.find((c) => claimMatchesSite(c, r.nctId, r));
                            return (
                              <tr key={r.key}>
                                <td>
                                  <b>{r.nctId}</b>
                                  <div className="sup">{r.briefTitle}</div>
                                </td>
                                <td>
                                  {[r.facility, r.city].filter(Boolean).join(', ')}
                                  {claim && <div className="sup">Claimed by {claim.claimedByName}</div>}
                                </td>
                                <td>{r.contactName || '—'}</td>
                                <td style={{ textAlign: 'right' }}>
                                  <button
                                    className="btn-danger"
                                    style={{ padding: '4px 10px', fontSize: 11.5 }}
                                    onClick={() =>
                                      setAdminClose({
                                        id: claim ? claim.id : siteCloseId(r),
                                        target: { ...r, hospitalName: claim?.hospitalName ?? '' },
                                      })
                                    }
                                  >
                                    Close trial
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {closeMatchesTotal > closeMatches.length && (
                        <div className="sup" style={{ marginTop: 8 }}>
                          Showing {closeMatches.length} of {closeMatchesTotal} matching sites — refine the search to narrow it down.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 3: DOCTORS, PIs & TRIAL TEAMS */}
        {adminTab === 'doctors' && (
          <div>
            <div className="admin-section-head">
              <div>
                <h2 style={{ fontSize: 18, margin: 0, fontWeight: 780 }}>Accounts</h2>
                <p className="sup" style={{ margin: '4px 0 0' }}>
                  Approve self-registered PIs, edit account details, change roles, and create pre-approved accounts for any role
                </p>
              </div>
              <button className="btn" onClick={() => setMergeDialog({})} style={{ marginLeft: 'auto' }} title="Same person registered twice with different emails">
                ⇄ Merge accounts
              </button>
              <button className="btn primary" onClick={() => setCreateDoctorOpen(true)}>
                ➕ Create Account
              </button>
            </div>

            {pendingMerges.length > 0 && (
              <div className="card full" style={{ marginTop: 14 }}>
                <h2 style={{ fontSize: 15, margin: '0 0 4px' }}>Merge requests ({pendingMerges.length})</h2>
                <p className="sup" style={{ margin: '0 0 10px' }}>
                  Asked for by the account holder, who proved they own both logins by signing in to each.
                </p>
                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Keep</th>
                        <th>Merge in &amp; remove</th>
                        <th>Note</th>
                        <th>Asked</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {pendingMerges.map((r) => {
                        const keep = allUsers.find((u) => u.uid === r.keepUid);
                        const dup = allUsers.find((u) => u.uid === r.dupUid);
                        return (
                          <tr key={r.id}>
                            <td>
                              <b>{r.keepName}</b>
                              <div className="sup">{r.keepEmail}</div>
                            </td>
                            <td>
                              <b>{r.dupName}</b>
                              <div className="sup">{r.dupEmail}</div>
                            </td>
                            <td>{r.note || '—'}</td>
                            <td>{formatTimestamp(r.createdAt)}</td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <button
                                className="btn primary"
                                style={{ padding: '4px 10px', fontSize: 11.5, marginRight: 6 }}
                                disabled={!keep || !dup}
                                title={!keep || !dup ? 'One of these accounts no longer exists' : undefined}
                                onClick={() => setMergeDialog({ keep, dup, requestId: r.id })}
                              >
                                Review &amp; merge
                              </button>
                              <button
                                className="btn"
                                style={{ padding: '4px 10px', fontSize: 11.5 }}
                                onClick={() => dismissMergeRequest(r.id).then(() => flash('Merge request dismissed.'))}
                              >
                                Dismiss
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {actionFeedback && (
              <div className="note" style={{ background: '#e3f7e9', color: '#16794b', borderColor: '#a3e6b7' }}>
                ✓ {actionFeedback}
              </div>
            )}

            {/* KPIs */}
            <div className="kpis" style={{ marginTop: 16 }}>
              <KpiButton onClick={() => goPeopleTab('pis')}>
                <div className={`n ${pendingDoctors.length > 0 ? 'warn' : ''}`}>{pendingDoctors.length}</div>
                <div className="l">Pending PI Approvals</div>
                <div className="d">{pendingDoctors.length > 0 ? 'Action required' : 'All clear'}</div>
              </KpiButton>
              <KpiButton onClick={() => goPeopleTab('pis')}>
                <div className="n">{approvedDoctors.length}</div>
                <div className="l">Verified PIs</div>
              </KpiButton>
              <KpiButton onClick={() => goPeopleTab('trialDoctors')}>
                <div className="n">{trialDoctors.length}</div>
                <div className="l">Trial Team Doctors</div>
              </KpiButton>
              <KpiButton active={accountsDrill === 'hospitals'} onClick={() => toggleAccountsDrill('hospitals')}>
                <div className="n">{distinctHospitals}</div>
                <div className="l">Affiliated Hospitals</div>
              </KpiButton>
              <KpiButton onClick={() => setAdminTab('activity')}>
                <div className="n">{claimedAddedTotal}</div>
                <div className="l">Claimed & Added Trials</div>
                <div className="d">
                  {claims.length} claimed · {allSubmitted.length + allAddedSites.length} added
                </div>
              </KpiButton>
              <KpiButton onClick={() => goPeopleTab('all')}>
                <div className="n">{allDoctorAccounts.filter((d) => contactMarks.get(d.uid)?.contacted).length}</div>
                <div className="l">Doctors contacted</div>
                <div className="d">
                  {allDoctorAccounts.filter((d) => !contactMarks.get(d.uid)?.contacted).length} not contacted yet
                </div>
              </KpiButton>
            </div>

            {accountsDrill === 'hospitals' && (
              <DrillPanel title={`Affiliated hospitals (${hospitalList.length})`} note="Hospitals with at least one verified PI or Trial Team Doctor." onClose={() => setAccountsDrill(null)}>
                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Hospital</th>
                        <th>City</th>
                        <th>Verified PIs / doctors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hospitalList.map((h) => (
                        <tr key={h.name}>
                          <td><b>{h.name}</b></td>
                          <td>{h.city || '—'}</td>
                          <td>{h.people.map((p) => p.name).join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DrillPanel>
            )}


            {/* Sub-tabs */}
            <div className="portal-tabs" style={{ marginTop: 18, scrollMarginTop: 12 }} ref={peopleTabsRef}>
              <button className={`portal-tab ${peopleTab === 'all' ? 'active' : ''}`} onClick={() => setPeopleTab('all')}>
                All Registered Doctors ({allDoctorAccounts.length})
              </button>
              <button className={`portal-tab ${peopleTab === 'pis' ? 'active' : ''}`} onClick={() => setPeopleTab('pis')}>
                Principal Investigators ({piOnly.length})
                {pendingDoctors.some((d) => d.piTitle !== 'trialDoctor') && (
                  <span className="tab-pending-badge">{pendingDoctors.filter((d) => d.piTitle !== 'trialDoctor').length}</span>
                )}
              </button>
              <button
                className={`portal-tab ${peopleTab === 'trialDoctors' ? 'active' : ''}`}
                onClick={() => setPeopleTab('trialDoctors')}
              >
                Trial Doctors ({trialDoctors.length})
                {pendingDoctors.some((d) => d.piTitle === 'trialDoctor') && (
                  <span className="tab-pending-badge">{pendingDoctors.filter((d) => d.piTitle === 'trialDoctor').length}</span>
                )}
              </button>
              <button
                className={`portal-tab ${peopleTab === 'coordinators' ? 'active' : ''}`}
                onClick={() => setPeopleTab('coordinators')}
              >
                Trial Coordinators ({coordinators.length})
              </button>
              <button
                className={`portal-tab ${peopleTab === 'individuals' ? 'active' : ''}`}
                onClick={() => setPeopleTab('individuals')}
              >
                Individuals ({individuals.length})
              </button>
              <button className={`portal-tab ${peopleTab === 'history' ? 'active' : ''}`} onClick={() => setPeopleTab('history')}>
                Approval History ({authHistory.length + teamLog.length})
              </button>
            </div>

            {peopleTab === 'all' && (
              <AllDoctorsSection
                doctors={allDoctorAccounts}
                phoneOf={phoneOf}
                onEdit={setEditTarget}
                contactMarks={contactMarks}
                adminEmail={user.email ?? ''}
              />
            )}

            {peopleTab === 'individuals' && (
              <IndividualsSection individuals={individuals} phoneOf={phoneOf} onEdit={setEditTarget} />
            )}

            {(peopleTab === 'pis' || peopleTab === 'trialDoctors') && (
              <>
                {/* PENDING APPROVALS */}
                <div className="sechead2">
                  <h2>Pending {kindLabel} ({pendingDoctors.filter(ofShownKind).length})</h2>
                  <span className="sup">
                    Saved accounts awaiting verification — by you, or by a verified PI at the same hospital
                  </span>
                </div>
                <div className="card full">
                  {pendingDoctors.some(ofShownKind) && (
                    <div className="admin-search-row">
                      <input
                        type="search"
                        className="claim-input"
                        value={pendingSearch}
                        onChange={(e) => setPendingSearch(e.target.value)}
                        placeholder={`Search pending ${kindLabel} by name, email, hospital or city…`}
                        aria-label="Search pending Principal Investigators"
                      />
                    </div>
                  )}
                  {!pendingDoctors.some(ofShownKind) ? (
                    <div className="sup">No pending doctor approvals right now. All registrations are processed!</div>
                  ) : !visiblePendingDoctors.some(ofShownKind) ? (
                    <div className="sup">No pending {kindLabel} match "{pendingSearch}".</div>
                  ) : (
                    <div className="tablewrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Contacted</th>
                            <th>Doctor Name</th>
                            <th>Hospital / Institution</th>
                            <th>Location</th>
                            <th>Email</th>
                            <th>Phone</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visiblePendingDoctors.filter(ofShownKind).map((d) => (
                            <tr key={d.uid} className={rowCls(d.uid)}>
                              <td>{contactedCell(d.uid)}</td>
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
                                    style={{ padding: '6px 12px', fontSize: 12 }}
                                    onClick={() => setEditTarget(d)}
                                  >
                                    Edit
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

                {/* VERIFIED PRINCIPAL INVESTIGATORS */}
                <div className="sechead2">
                  <h2>Verified {kindLabel} ({approvedDoctors.filter(ofShownKind).length})</h2>
                  <span className="sup">
                    Authorized to claim trials, add site contacts, approve their trial team, and authorize PIs at their hospital
                  </span>
                </div>
                <div className="card full">
                  {approvedDoctors.some(ofShownKind) && (
                    <div className="admin-search-row">
                      <input
                        type="search"
                        className="claim-input"
                        value={piSearch}
                        onChange={(e) => setPiSearch(e.target.value)}
                        placeholder={`Search verified ${kindLabel} by name, email, hospital, city or specialization…`}
                        aria-label="Search verified Principal Investigators"
                      />
                    </div>
                  )}
                  {!approvedDoctors.some(ofShownKind) ? (
                    <div className="sup">No approved doctor accounts yet. Use the "+ Create Account" button above to add one.</div>
                  ) : !visibleApprovedDoctors.some(ofShownKind) ? (
                    <div className="sup">No verified {kindLabel} match "{piSearch}".</div>
                  ) : (
                    <div className="tablewrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Contacted</th>
                            <th>Doctor Name</th>
                            <th>Hospital / Institution</th>
                            <th>Specialization</th>
                            <th>Location</th>
                            <th>Email</th>
                            <th>Phone</th>
                            <th>Coordinators</th>
                            <th style={{ textAlign: 'right' }}>Management</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleApprovedDoctors.filter(ofShownKind).map((d) => {
                            const team = coordinators.filter((u) => u.doctorUid === d.uid);
                            return (
                              <tr key={d.uid} className={rowCls(d.uid)}>
                                <td>{contactedCell(d.uid)}</td>
                                <td><b>{d.name}</b></td>
                                <td>{d.facility || '—'}</td>
                                <td>{d.specialization || '—'}</td>
                                <td>{[d.city, d.state].filter(Boolean).join(', ') || '—'}</td>
                                <td>{d.email}</td>
                                <td>{phoneOf(d.uid)}</td>
                                <td>
                                  {team.length === 0 ? (
                                    '—'
                                  ) : (
                                    <span className="sup">{team.length} coordinator(s)</span>
                                  )}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                    <button
                                      className="btn"
                                      style={{ padding: '4px 10px', fontSize: 11.5 }}
                                      onClick={() => setEditTarget(d)}
                                      title="Edit name, hospital, phone numbers and other details"
                                    >
                                      Edit
                                    </button>
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
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* REJECTED DOCTORS */}
                {rejectedDoctors.some(ofShownKind) && (
                  <>
                    <div className="sechead2">
                      <h2>Rejected {kindLabel} ({rejectedDoctors.filter(ofShownKind).length})</h2>
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
                            {rejectedDoctors.filter(ofShownKind).map((d) => (
                              <tr key={d.uid}>
                                <td><b>{d.name}</b></td>
                                <td>{d.facility || '—'}</td>
                                <td>{d.email}</td>
                                <td style={{ textAlign: 'right' }}>
                                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                    <button className="btn" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => setEditTarget(d)}>
                                      Edit
                                    </button>
                                    <button
                                      className="btn"
                                      style={{ padding: '4px 10px', fontSize: 11.5 }}
                                      disabled={busyDoctorUid === d.uid}
                                      onClick={() => handleApproveDoctor(d)}
                                    >
                                      Approve instead
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {peopleTab === 'coordinators' &&
              renderTeamTable({
                title: 'Trial Coordinators',
                blurb: 'Coordinators are approved by their Principal Investigator. Admins can promote a coordinator to PI.',
                members: coordinators,
                visible: visibleCoordinators,
                search: coordSearch,
                setSearch: setCoordSearch,
                placeholder: 'Search coordinators by name, email, hospital or PI…',
              })}

            {peopleTab === 'history' && (
              <>
                {/* TEAM APPROVAL LOG */}
                <div className="sechead2">
                  <h2>Coordinator approvals ({teamLog.length})</h2>
                  <span className="sup">Which Principal Investigator approved or rejected which trial coordinator, and when</span>
                </div>
                <div className="card full">
                  {teamLog.length === 0 ? (
                    <div className="sup">No team decisions recorded yet.</div>
                  ) : (
                    <div className="tablewrap">
                      <table>
                        <thead>
                          <tr>
                            <th>When</th>
                            <th>Team member</th>
                            <th>Role</th>
                            <th>Decision</th>
                            <th>Principal Investigator</th>
                            <th>Decided by</th>
                          </tr>
                        </thead>
                        <tbody>
                          {teamLog.map((h) => (
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
                                {h.piName}
                                {h.hospital && <div className="sup">{h.hospital}</div>}
                              </td>
                              <td>
                                {h.decidedByRole === 'admin' ? 'TrialWiz admin' : `PI · ${h.decidedByName}`}
                                <div className="sup">{h.decidedByEmail}</div>
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
              </>
            )}
          </div>
        )}

        {/* TAB 4: CLOSED TRIAL REPOSITORY + AUDIT TRAIL */}
        {adminTab === 'activity' && actionFeedback && (
          <div className="note" style={{ background: '#e3f7e9', color: '#16794b', borderColor: '#a3e6b7' }}>
            ✓ {actionFeedback}
          </div>
        )}
        {adminTab === 'activity' && (
          <ClaimedAddedSection
            claims={claims}
            submitted={allSubmitted}
            addedSites={allAddedSites}
            closedTrials={closedTrials}
            onCloseTrial={(id, target) => setAdminClose({ id, target })}
            onEdit={setTrialEdit}
          />
        )}

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
                Trial sites closed by a Principal Investigator, the trial's creator or admin — hidden from every active list
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
              <span className="sup">Trial closures, reopenings, role changes, approvals, account edits and deletions — append-only, newest first</span>
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

      {editTarget && (
        <EditAccountModal
          account={editTarget}
          mode="admin"
          admin={adminActor}
          onClose={() => setEditTarget(null)}
          onSaved={flash}
          onDelete={() => {
            setDeleteTarget(editTarget);
            setEditTarget(null);
          }}
          onMerge={() => {
            setMergeDialog({ keep: editTarget });
            setEditTarget(null);
          }}
        />
      )}

      {mergeDialog && (
        <MergeAccountsModal
          admin={adminActor}
          users={allUsers}
          initialKeep={mergeDialog.keep}
          initialDup={mergeDialog.dup}
          requestId={mergeDialog.requestId}
          onClose={() => setMergeDialog(null)}
          onMerged={flash}
        />
      )}

      {deleteTarget && (
        <DeleteAccountModal
          admin={adminActor}
          account={deleteTarget}
          approvedPis={approvedDoctors}
          onClose={() => setDeleteTarget(null)}
          onDeleted={flash}
        />
      )}

      {trialEdit && (
        <SiteFormModal
          badge={trialEdit.kind === 'trial' ? 'Admin · Edit submitted trial' : 'Admin · Edit added location'}
          title="Correct location & contact"
          subtitle={
            trialEdit.kind === 'trial'
              ? `${trialEdit.trial.briefTitle} · ${trialEdit.trial.nctId} · submitted by ${trialEdit.trial.submittedByName}`
              : `${trialEdit.site.briefTitle} · ${trialEdit.site.nctId} · added by ${trialEdit.site.addedByName}`
          }
          initial={(() => {
            const r = trialEdit.kind === 'trial' ? trialEdit.trial : trialEdit.site;
            return {
              facility: r.facility,
              city: r.city,
              state: r.state,
              contactName: r.contactName,
              contactPhone: r.contactPhone,
              contactEmail: r.contactEmail,
            };
          })()}
          submitLabel="Save correction"
          note="The change is live on the Trial Finder straight away and recorded in the audit trail."
          onSubmit={async (f) => {
            const before = trialEdit.kind === 'trial' ? trialEdit.trial : trialEdit.site;
            if (trialEdit.kind === 'trial') await updateSubmittedTrialSite(trialEdit.trial.nctId, f);
            else await updateAddedSite(trialEdit.site.id, f);
            const changed = (Object.keys(f) as Array<keyof SiteFields>)
              .filter((k) => (before[k] ?? '').toString().trim() !== (f[k] ?? '').toString().trim())
              .map((k) => `${k}: "${before[k] ?? ''}" → "${(f[k] ?? '').toString().trim()}"`);
            await writeAudit(
              adminActor,
              'trial_edited',
              `${before.nctId} · ${before.facility}`,
              `${trialEdit.kind === 'trial' ? 'Submitted trial' : 'Added location'} · ${changed.join('; ') || 'no change'}`,
            ).catch((e) => console.warn('[TrialWiz] audit write failed (trial edit):', e));
            flash(`Saved the correction to ${before.nctId}.`);
          }}
          onClose={() => setTrialEdit(null)}
        />
      )}

      {adminClose && (
        <CloseTrialModal
          closeId={adminClose.id}
          target={adminClose.target}
          actor={{ uid: user.uid, name: 'TrialWiz admin', email: user.email ?? '' }}
          badge="Admin action"
          onClose={() => setAdminClose(null)}
          onClosed={flash}
        />
      )}

      {pwOpen && <ChangePasswordModal user={user} onClose={() => setPwOpen(false)} onChanged={flash} />}

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
