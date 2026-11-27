import { useMemo, useState } from 'react';
import { siteCloseId, submittedCloseId, type CloseTarget } from '../../services/closedTrials';
import { ROLE_LABEL, type AddedSite, type ClosedTrial, type SubmittedTrial, type TrialClaim } from '../../types';
import { matchesSearch } from '../../utils/search';
import { formatTimestamp, timestampMs } from '../../utils/timestamps';

type Kind = 'claim' | 'trial' | 'location';
const KIND_LABEL: Record<Kind, string> = {
  claim: 'Claimed',
  trial: 'New trial added',
  location: 'Location added',
};

interface Row {
  key: string;
  kind: Kind;
  nctId: string;
  title: string;
  site: string;
  byName: string;
  byDetail: string;
  contact: string;
  at: unknown;
  status: string;
  closeId: string;
  closeTarget: CloseTarget;
  /** What the Edit button opens — submitted trials and added locations only. */
  editable?: EditTarget;
}

export type EditTarget = { kind: 'trial'; trial: SubmittedTrial } | { kind: 'location'; site: AddedSite };

interface Props {
  claims: TrialClaim[];
  submitted: SubmittedTrial[];
  addedSites: AddedSite[];
  closedTrials: ClosedTrial[];
  onCloseTrial: (id: string, target: CloseTarget) => void;
  /** Admin fixes a hospital name / city / contact someone typed wrongly. */
  onEdit?: (target: EditTarget) => void;
}

/**
 * Admin: one list of every trial a PI / Trial Team Doctor / coordinator has claimed, every new trial
 * they added, and every location they added to an existing trial — who did it, when, and the
 * contact published. Searchable and filterable by type.
 */
export function ClaimedAddedSection({ claims, submitted, addedSites, closedTrials, onCloseTrial, onEdit }: Props) {
  const [kind, setKind] = useState<'all' | Kind>('all');
  const [search, setSearch] = useState('');
  const closedIds = useMemo(() => new Set(closedTrials.map((c) => c.id)), [closedTrials]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const c of claims) {
      out.push({
        key: `claim:${c.id}`,
        kind: 'claim',
        nctId: c.nctId,
        title: c.briefTitle ?? '',
        site: [c.facility, c.city].filter(Boolean).join(', '),
        byName: c.claimedByName,
        byDetail: `${c.claimedByTitle ?? ROLE_LABEL[c.claimedByRole] ?? c.claimedByRole} · ${c.claimedByEmail}`,
        contact: [c.contactName, c.contactPhone, c.contactEmail].filter(Boolean).join(' · '),
        at: c.claimedAt,
        status: closedIds.has(c.id) ? 'closed' : 'active',
        closeId: c.id,
        closeTarget: c,
      });
    }
    for (const t of submitted) {
      const id = submittedCloseId(t.nctId);
      out.push({
        key: `trial:${t.nctId}`,
        kind: 'trial',
        nctId: t.nctId,
        title: t.briefTitle,
        site: [t.facility, t.city].filter(Boolean).join(', '),
        byName: t.submittedByName,
        byDetail: 'Submitted on TrialWiz',
        contact: [t.contactName, t.contactPhone, t.contactEmail].filter(Boolean).join(' · '),
        at: t.createdAt,
        status: closedIds.has(id) ? 'closed' : t.listingStatus === 'retired' ? 'retired' : 'active',
        closeId: id,
        closeTarget: t,
        editable: { kind: 'trial', trial: t },
      });
    }
    for (const a of addedSites) {
      const id = siteCloseId(a);
      out.push({
        key: `location:${a.id}`,
        kind: 'location',
        nctId: a.nctId,
        title: a.briefTitle,
        site: [a.facility, a.city].filter(Boolean).join(', '),
        byName: a.addedByName,
        byDetail: ROLE_LABEL[a.addedByRole] ?? a.addedByRole,
        contact: [a.contactName, a.contactPhone, a.contactEmail].filter(Boolean).join(' · '),
        at: a.createdAt,
        status: closedIds.has(id) ? 'closed' : 'active',
        closeId: id,
        closeTarget: a,
        editable: { kind: 'location', site: a },
      });
    }
    return out.sort((x, y) => (timestampMs(y.at) ?? 0) - (timestampMs(x.at) ?? 0));
  }, [claims, submitted, addedSites, closedIds]);

  const visible = rows.filter(
    (r) => (kind === 'all' || r.kind === kind) && matchesSearch(search, [r.nctId, r.title, r.site, r.byName, r.byDetail, r.contact]),
  );
  const count = (k: Kind) => rows.filter((r) => r.kind === k).length;

  return (
    <>
      <div className="sechead2" style={{ marginTop: 0 }}>
        <h2>Claimed & Added Trials ({rows.length})</h2>
        <span className="sup">
          Every trial claimed, every new trial added and every location added — by whom and when, newest first
        </span>
      </div>

      <div className="kpis">
        {(['claim', 'trial', 'location'] as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            className={`kpi clickable${kind === k ? ' active' : ''}`}
            onClick={() => setKind(kind === k ? 'all' : k)}
            aria-pressed={kind === k}
          >
            <div className="n">{count(k)}</div>
            <div className="l">{k === 'claim' ? 'Claimed trials' : k === 'trial' ? 'New trials added' : 'Locations added'}</div>
            <div className="d">{kind === k ? 'showing only these ▴' : 'filter ▾'}</div>
          </button>
        ))}
      </div>

      <div className="card full" style={{ marginTop: 16 }}>
        <div className="admin-search-row">
          <input
            type="search"
            className="claim-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by trial id, title, hospital, or who claimed / added it…"
            aria-label="Search claimed and added trials"
          />
          <select className="claim-select" value={kind} onChange={(e) => setKind(e.target.value as 'all' | Kind)} aria-label="Filter by type">
            <option value="all">All types ({rows.length})</option>
            <option value="claim">Claimed ({count('claim')})</option>
            <option value="trial">New trial added ({count('trial')})</option>
            <option value="location">Location added ({count('location')})</option>
          </select>
        </div>
        {rows.length === 0 ? (
          <div className="sup">No trials have been claimed or added yet.</div>
        ) : visible.length === 0 ? (
          <div className="sup">Nothing matches these filters.</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Trial</th>
                  <th>Site</th>
                  <th>By</th>
                  <th>Public contact</th>
                  <th>When</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.key}>
                    <td>
                      <span className={`pill ${r.kind === 'claim' ? 'approved' : 'pending'}`}>{KIND_LABEL[r.kind]}</span>
                    </td>
                    <td>
                      <b>{r.nctId}</b>
                      {r.title && <div className="sup">{r.title}</div>}
                    </td>
                    <td>{r.site || '—'}</td>
                    <td>
                      {r.byName}
                      <div className="sup">{r.byDetail}</div>
                    </td>
                    <td>{r.contact || '—'}</td>
                    <td>{formatTimestamp(r.at)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {onEdit && r.editable && (
                        <button
                          className="btn"
                          style={{ padding: '4px 10px', fontSize: 11.5, marginRight: 6 }}
                          onClick={() => onEdit(r.editable!)}
                          title="Correct the hospital name, city or contact details"
                        >
                          Edit
                        </button>
                      )}
                      {r.status === 'closed' ? (
                        <span className="pill closed-pill">Closed</span>
                      ) : r.status === 'retired' ? (
                        <span className="pill">Retired</span>
                      ) : (
                        <button
                          className="btn-danger"
                          style={{ padding: '4px 10px', fontSize: 11.5 }}
                          onClick={() => onCloseTrial(r.closeId, r.closeTarget)}
                        >
                          Close trial
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
