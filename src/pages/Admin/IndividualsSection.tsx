import { useMemo, useState, type ReactNode } from 'react';
import type { UserProfile } from '../../types';
import { matchesSearch } from '../../utils/search';
import { formatTimestamp, timestampMs } from '../../utils/timestamps';

interface Props {
  /** Public Trial Finder accounts that signed up as an individual (patient, family, caregiver). */
  individuals: UserProfile[];
  phoneOf: (uid: string) => ReactNode;
  onEdit: (account: UserProfile) => void;
}

/** Admin: every Individual account, searchable, each editable. */
export function IndividualsSection({ individuals, phoneOf, onEdit }: Props) {
  const [search, setSearch] = useState('');
  const rows = useMemo(
    () =>
      individuals
        .filter((u) => matchesSearch(search, [u.name, u.email]))
        .sort((a, b) => (timestampMs(b.createdAt) ?? 0) - (timestampMs(a.createdAt) ?? 0)),
    [individuals, search],
  );

  return (
    <>
      <div className="sechead2">
        <h2>Individuals ({individuals.length})</h2>
        <span className="sup">Patients, family members and caregivers with a Trial Finder account</span>
      </div>
      <div className="card full">
        {individuals.length > 0 && (
          <div className="admin-search-row">
            <input
              type="search"
              className="claim-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search individuals by name or email…"
              aria-label="Search individuals"
            />
          </div>
        )}
        {individuals.length === 0 ? (
          <div className="sup">No individual accounts yet.</div>
        ) : rows.length === 0 ? (
          <div className="sup">No individuals match "{search}".</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Registered</th>
                  <th>Last sign-in</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.uid}>
                    <td>
                      <b>{u.name || '—'}</b>
                    </td>
                    <td>
                      <a href={`mailto:${u.email}`}>{u.email}</a>
                    </td>
                    <td>{phoneOf(u.uid)}</td>
                    <td>{formatTimestamp(u.createdAt)}</td>
                    <td>{u.lastLoginAt ? formatTimestamp(u.lastLoginAt) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => onEdit(u)}>
                        Edit
                      </button>
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
