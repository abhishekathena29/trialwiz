import { useMemo, useState, type ReactNode } from 'react';
import type { UserProfile } from '../../types';
import { matchesSearch } from '../../utils/search';
import { formatTimestamp, timestampMs } from '../../utils/timestamps';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'doctor';

/** Principal Investigators (role 'doctor') need verification; referring doctors (public
 * accounts with userType 'doctor') don't. */
function statusOf(d: UserProfile): { label: string; cls: string; key: StatusFilter } {
  if (d.role !== 'doctor') return { label: 'No verification needed', cls: '', key: 'doctor' };
  if (d.status === 'approved') return { label: 'Verified', cls: 'approved', key: 'approved' };
  if (d.status === 'rejected') return { label: 'Rejected', cls: 'rejected', key: 'rejected' };
  return { label: 'Pending', cls: 'pending', key: 'pending' };
}

function authorizedBy(d: UserProfile): string {
  if (d.role !== 'doctor' || d.status !== 'approved') return '—';
  if (!d.authorizedByRole) return 'Admin (before history was kept)';
  const who = d.authorizedByRole === 'admin' ? 'Admin' : `PI · ${d.authorizedByName ?? ''}`;
  return d.authorizedAt ? `${who} · ${formatTimestamp(d.authorizedAt)}` : who;
}

interface Props {
  /** Every PI profile plus every referring-doctor account. */
  doctors: UserProfile[];
  phoneOf: (uid: string) => ReactNode;
}

/** Admin: every doctor who has an account — PIs (pending, verified, rejected) and referring doctors. */
export function AllDoctorsSection({ doctors, phoneOf }: Props) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const rows = useMemo(
    () =>
      doctors
        .filter((d) => status === 'all' || statusOf(d).key === status)
        .filter((d) => matchesSearch(search, [d.name, d.email, d.facility, d.specialization, d.city]))
        .sort((a, b) => (timestampMs(b.createdAt) ?? 0) - (timestampMs(a.createdAt) ?? 0)),
    [doctors, search, status],
  );

  return (
    <>
      <div className="sechead2">
        <h2>All Registered Doctors ({doctors.length})</h2>
        <span className="sup">
          Every doctor with an account — Principal Investigators (pending, verified or rejected) and referring doctors
        </span>
      </div>
      <div className="card full">
        <div className="admin-search-row">
          <input
            type="search"
            className="claim-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, hospital or specialization…"
            aria-label="Search registered doctors"
          />
          <select
            className="claim-select"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending PIs</option>
            <option value="approved">Verified PIs</option>
            <option value="rejected">Rejected PIs</option>
            <option value="doctor">Referring doctors</option>
          </select>
        </div>
        {rows.length === 0 ? (
          <div className="sup">{doctors.length === 0 ? 'No doctor accounts yet.' : 'No doctors match this search.'}</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Hospital</th>
                  <th>Specialization</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Registered</th>
                  <th>Status</th>
                  <th>Authorized by</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const st = statusOf(d);
                  return (
                    <tr key={d.uid}>
                      <td>
                        <b>{d.name}</b>
                      </td>
                      <td>{d.role === 'doctor' ? 'Principal Investigator' : 'Doctor'}</td>
                      <td>{d.facility || '—'}</td>
                      <td>{d.specialization || '—'}</td>
                      <td>
                        <a href={`mailto:${d.email}`}>{d.email}</a>
                      </td>
                      <td>{phoneOf(d.uid)}</td>
                      <td>{formatTimestamp(d.createdAt)}</td>
                      <td>{st.cls ? <span className={`pill ${st.cls}`}>{st.label}</span> : <span className="sup">{st.label}</span>}</td>
                      <td>{authorizedBy(d)}</td>
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
