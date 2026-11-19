import { useState } from 'react';
import { closeTrialSite, type CloseActor, type CloseTarget } from '../../services/closedTrials';
import './Portal.css';

interface Props {
  /** Repository doc id — the claim id, `siteCloseId(...)` or `submittedCloseId(...)`. */
  closeId: string;
  target: CloseTarget;
  actor: CloseActor;
  /** Who is acting, shown as the badge, e.g. "Principal Investigator action". */
  badge?: string;
  onClose: () => void;
  onClosed?: (message: string) => void;
}

/** Marks one trial site as closed — used by PIs, admins and whoever submitted a trial. */
export function CloseTrialModal({ closeId, target, actor, badge = 'Principal Investigator action', onClose, onClosed }: Props) {
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const where = [target.facility, target.city].filter(Boolean).join(', ');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmed) return;
    setBusy(true);
    setErr('');
    try {
      await closeTrialSite(closeId, target, actor, reason);
      onClosed?.(`Closed ${target.nctId} at ${where}. It's in the closed-trial repository and can be reopened there.`);
      onClose();
    } catch (e) {
      console.error('[TrialWiz] close trial error:', e);
      const msg = e instanceof Error ? e.message : '';
      setErr(
        msg.includes('permission')
          ? "You don't have permission to close this trial site."
          : msg || 'Failed to close the trial.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tw-admin">
      <div className="claim-modal-overlay" onClick={onClose}>
        <div className="claim-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
          <div className="claim-modal-head">
            <div>
              <span className="claim-badge-role">{badge}</span>
              <h2>Close this trial</h2>
              <p className="claim-sub">
                {target.nctId} · {where}
              </p>
            </div>
            <button className="claim-close-btn" onClick={onClose} type="button" aria-label="Close">
              ✕
            </button>
          </div>

          {target.briefTitle && (
            <div className="claim-trial-snippet">
              <div className="claim-trial-title">{target.briefTitle}</div>
            </div>
          )}

          {err && <div className="login-err" style={{ margin: '12px 0' }}>{err}</div>}

          <form onSubmit={submit} className="claim-form">
            <div className="form-group">
              <label htmlFor="close-reason">Reason (optional)</label>
              <textarea
                id="close-reason"
                className="claim-textarea"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Enrolment complete, study terminated by sponsor, site withdrawn"
                maxLength={500}
              />
            </div>

            <div className="claim-confirm-card">
              <label className="checkbox-label">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                <span>
                  I confirm this trial is <b>closed at {where}</b>. It will be moved to the closed-trial repository and
                  removed from the active lists on TrialWiz. This is recorded in the audit trail.
                </span>
              </label>
            </div>

            <div className="claim-actions" style={{ marginTop: 18 }}>
              <button type="button" className="btn" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn-danger" disabled={busy || !confirmed} style={{ marginLeft: 'auto' }}>
                {busy ? 'Closing…' : 'Close trial'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
