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
import { AdminHeader } from './AdminHeader';

const PERIODS: Array<[number, string]> = [
  [30, 'Last 30 days'],
  [90, 'Last 90 days'],
  [365, 'Last 12 months'],
];

function Bars({ rows }: { rows: [string, number][] }) {
  if (!rows.length) return <div className="sup">No searches recorded in this period yet.</div>;
  const max = Math.max(...rows.map((r) => r[1]));
  return (
    <>
      {rows.map(([k, v]) => (
        <div className="bar" key={k}>
          <span className="k">{k}</span>
          <span className="track">
            <span className="fill" style={{ width: `${max ? Math.round((v / max) * 100) : 0}%` }} />
          </span>
          <span className="v">{displayCount(v)}</span>
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
  const [periodDays, setPeriodDays] = useState(90);
  const [records, setRecords] = useState<DemandRecord[] | null>(null);
  const [usageRecords, setUsageRecords] = useState<UsageRecord[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve(); // yield first so this setState never runs synchronously within the effect
      if (cancelled) return;
      setRecords(null);
      setUsageRecords(null);
      setError('');
      const sinceMs = Date.now() - periodDays * 86_400_000;
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
                    <div className="n">{displayCount(usageAgg.signups)}</div>
                    <div className="l">New accounts</div>
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
              <button
                className="btn"
                disabled
                title="Add a document to the Firestore 'admins' collection, keyed by the user's Auth UID"
              >
                Manage access
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
