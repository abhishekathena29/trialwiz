import { useEffect, useMemo, useState } from 'react';
import { mergeAccountsByAdmin, mergeBlocker, previewMerge, type MergePreview } from '../../services/accountMerge';
import type { AuditActor } from '../../services/audit';
import { accountLabel, type UserProfile } from '../../types';
import { matchesSearch } from '../../utils/search';
import '../Portal/Portal.css';
import './Admin.css';

function describe(u: UserProfile) {
  return `${u.name} · ${u.email} · ${accountLabel(u)}${u.status ? ` (${u.status})` : ''}${u.facility ? ` · ${u.facility}` : ''}`;
}

function AccountPicker({
  id,
  label,
  hint,
  accounts,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  accounts: UserProfile[];
  value: UserProfile | null;
  onChange: (u: UserProfile | null) => void;
}) {
  const [search, setSearch] = useState('');
  const matches = useMemo(
    () => accounts.filter((u) => matchesSearch(search, [u.name, u.email, u.facility, u.city])).slice(0, 60),
    [accounts, search],
  );
  return (
    <div className="form-group">
      <label htmlFor={id}>
        {label} <span className="req">*</span>
      </label>
      <span className="field-hint">{hint}</span>
      {value ? (
        <div className="pi-match" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1 }}>
            <b>{value.name}</b> · {value.email}
            <br />
            <span className="sup">
              {accountLabel(value)}
              {value.status ? ` · ${value.status}` : ''}
              {value.facility ? ` · ${value.facility}` : ''}
            </span>
          </span>
          <button type="button" className="btn" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => onChange(null)}>
            Change
          </button>
        </div>
      ) : (
        <>
          <input
            id={id}
            type="search"
            className="claim-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email or hospital…"
            autoComplete="off"
          />
          {search.trim() && (
            <select
              className="claim-select"
              size={Math.min(6, Math.max(2, matches.length))}
              style={{ marginTop: 6 }}
              onChange={(e) => onChange(accounts.find((u) => u.uid === e.target.value) ?? null)}
              aria-label={label}
            >
              {matches.map((u) => (
                <option key={u.uid} value={u.uid}>
                  {describe(u)}
                </option>
              ))}
            </select>
          )}
        </>
      )}
    </div>
  );
}

interface Props {
  admin: AuditActor;
  /** Every account (admins are filtered out here). */
  users: UserProfile[];
  initialKeep?: UserProfile | null;
  initialDup?: UserProfile | null;
  /** When opened from a PI's merge request. */
  requestId?: string;
  onClose: () => void;
  onMerged: (message: string) => void;
}

/** Admin: merge two accounts the same person made with different emails into one. */
export function MergeAccountsModal({ admin, users, initialKeep, initialDup, requestId, onClose, onMerged }: Props) {
  const accounts = useMemo(() => users.filter((u) => u.role !== 'admin'), [users]);
  const [keep, setKeep] = useState<UserProfile | null>(initialKeep ?? null);
  const [dup, setDup] = useState<UserProfile | null>(initialDup ?? null);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const blocker = keep && dup ? mergeBlocker(keep, dup) : null;

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => !cancelled && setPreview(null));
    if (!dup) return;
    previewMerge(dup)
      .then((p) => !cancelled && setPreview(p))
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : 'Could not load what this account owns.'));
    return () => {
      cancelled = true;
    };
  }, [dup]);

  async function merge(e: React.FormEvent) {
    e.preventDefault();
    if (!keep || !dup || blocker || !confirmed) return;
    setBusy(true);
    setErr('');
    try {
      const summary = await mergeAccountsByAdmin(admin, keep, dup, requestId);
      onMerged(`Merged ${dup.email} into ${keep.email} — ${summary}. ${dup.email} can no longer sign in.`);
      onClose();
    } catch (e) {
      console.error('[TrialWiz] merge failed:', e);
      setErr(e instanceof Error ? e.message : 'Merge failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="claim-modal-overlay" onClick={onClose}>
      <div className="claim-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <div className="claim-modal-head">
          <div>
            <span className="claim-badge-role">Admin action</span>
            <h2>Merge two accounts</h2>
            <p className="claim-sub">For one person who registered twice with different emails.</p>
          </div>
          <button className="claim-close-btn" onClick={onClose} type="button" aria-label="Close">
            ✕
          </button>
        </div>

        {err && <div className="login-err" style={{ margin: '12px 0' }}>{err}</div>}

        <form onSubmit={merge} className="claim-form">
          <span className="req-legend">
            Fields marked <span className="req">*</span> are required.
          </span>
          <AccountPicker
            id="merge-keep"
            label="Account to keep"
            hint="They keep signing in with this email."
            accounts={accounts.filter((u) => u.uid !== dup?.uid)}
            value={keep}
            onChange={(u) => {
              setKeep(u);
              setConfirmed(false);
            }}
          />
          {keep && dup && (
            <div style={{ textAlign: 'center', margin: '-4px 0 6px' }}>
              <button
                type="button"
                className="linkbtn"
                onClick={() => {
                  setKeep(dup);
                  setDup(keep);
                  setConfirmed(false);
                }}
              >
                ⇅ Swap — keep the other one instead
              </button>
            </div>
          )}
          <AccountPicker
            id="merge-dup"
            label="Account to merge in (will be removed)"
            hint="Everything it owns moves to the account above; then this login stops working."
            accounts={accounts.filter((u) => u.uid !== keep?.uid)}
            value={dup}
            onChange={(u) => {
              setDup(u);
              setConfirmed(false);
            }}
          />

          {blocker && <div className="login-err">{blocker}</div>}

          {keep && dup && !blocker && (
            <div className="note" style={{ marginTop: 4 }}>
              <b>What happens</b>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {preview ? (
                  <li>
                    Moves to {keep.name}: {preview.claims} claim(s), {preview.submitted} submitted trial(s), {preview.addedSites}{' '}
                    added location(s), {preview.coordinators} coordinator(s)
                    {preview.teamItems > 0 && keep.role === 'doctor' && `, and ${preview.teamItems} teammate item(s) filed under them`}.
                  </li>
                ) : (
                  <li>Checking what {dup.email} owns…</li>
                )}
                <li>Blank profile fields and phone numbers on the kept account are filled in from the other one.</li>
                <li>
                  Registry trials listing <b>{dup.email}</b> still show in {keep.name}’s “My Trials”.
                </li>
                {keep.role === 'doctor' && dup.role === 'doctor' && dup.status === 'approved' && keep.status !== 'approved' && (
                  <li>{dup.email} is verified, so the kept account becomes verified too.</li>
                )}
                <li>
                  <b>{dup.email}</b> is deleted and can’t sign in any more. Recorded in the audit trail.
                </li>
              </ul>
            </div>
          )}

          {keep && dup && !blocker && (
            <label className="checkbox-label" style={{ fontSize: 12.5, marginTop: 10 }}>
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>
                I’ve checked that <b>{keep.email}</b> and <b>{dup.email}</b> are the same person.
              </span>
            </label>
          )}

          <div className="claim-actions" style={{ marginTop: 18 }}>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
              <button type="button" className="btn" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn-danger" disabled={busy || !keep || !dup || Boolean(blocker) || !confirmed || !preview}>
                {busy ? 'Merging…' : 'Merge accounts'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
