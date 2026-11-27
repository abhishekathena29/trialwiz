import { useEffect, useState } from 'react';
import { requestMerge, subscribeMyMergeRequests } from '../../services/accountMerge';
import type { MergeRequest, UserProfile } from '../../types';
import { formatTimestamp } from '../../utils/timestamps';
import './Portal.css';

/**
 * PI / coordinator: "I have another TrialWiz account under a different email — merge it into this
 * one." They sign in to the other account here (proving it's theirs); TrialWiz admin then merges.
 */
export function MergeRequestModal({ profile, onClose, onSent }: { profile: UserProfile; onClose: () => void; onSent: (m: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [mine, setMine] = useState<MergeRequest[]>([]);
  useEffect(() => subscribeMyMergeRequests(profile.uid, setMine), [profile.uid]);
  const canSend = !busy && email.trim().includes('@') && password.length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    setBusy(true);
    setErr('');
    try {
      await requestMerge(profile, email, password, note);
      onSent(`Merge request sent — TrialWiz admin will merge ${email.trim()} into this account.`);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send the request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="claim-modal-overlay" onClick={onClose}>
      <div className="claim-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className="claim-modal-head">
          <div>
            <span className="claim-badge-role">Your account</span>
            <h2>Merge another account into this one</h2>
            <p className="claim-sub">
              Registered twice with different emails? Everything on the other account — claims, added trials and
              locations, your coordinators — moves here, and you keep signing in as <b>{profile.email}</b>.
            </p>
          </div>
          <button className="claim-close-btn" onClick={onClose} type="button" aria-label="Close">
            ✕
          </button>
        </div>

        {err && <div className="login-err" style={{ margin: '12px 0' }}>{err}</div>}

        {mine.length > 0 && (
          <div className="note" style={{ margin: '10px 0' }}>
            {mine.map((r) => (
              <div key={r.id}>
                {r.dupEmail} — {r.status === 'pending' ? 'waiting for TrialWiz admin' : r.status === 'merged' ? 'merged ✓' : 'not merged (contact admin)'}{' '}
                <span className="sup">· asked {formatTimestamp(r.createdAt)}</span>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={submit} className="claim-form">
          <span className="req-legend">
            Fields marked <span className="req">*</span> are required.
          </span>
          <div className="form-group">
            <label htmlFor="merge-email">
              Email of your other account <span className="req">*</span>
            </label>
            <input id="merge-email" type="email" className="claim-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required />
          </div>
          <div className="form-group">
            <label htmlFor="merge-pass">
              Its password <span className="req">*</span>
            </label>
            <span className="field-hint">
              Only used to confirm the other account is yours — you stay signed in here. Forgot it? Reset it from the log-in
              page first.
            </span>
            <input id="merge-pass" type="password" className="claim-input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" required />
          </div>
          <div className="form-group">
            <label htmlFor="merge-note">Note for admin (optional)</label>
            <input id="merge-note" className="claim-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. old hospital email" />
          </div>
          <div className="claim-actions" style={{ marginTop: 18 }}>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
              <button type="button" className="btn" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={!canSend}>
                {busy ? 'Checking…' : 'Send merge request'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
