import { useState } from 'react';
import { closeTrial } from '../../services/closedTrials';
import type { TrialClaim, UserProfile } from '../../types';
import './Portal.css';

interface Props {
  claim: TrialClaim;
  pi: UserProfile;
  onClose: () => void;
  onClosed?: () => void;
}

/** Principal Investigator-only: marks one claimed trial site as closed. */
export function CloseTrialModal({ claim, pi, onClose, onClosed }: Props) {
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const where = [claim.facility, claim.city].filter(Boolean).join(', ');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmed) return;
    setBusy(true);
    setErr('');
    try {
      await closeTrial(claim, pi, reason);
      onClosed?.();
      onClose();
    } catch (e) {
      console.error('[TrialWiz] close trial error:', e);
      setErr(e instanceof Error ? e.message : 'Failed to close the trial.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="claim-modal-overlay" onClick={onClose}>
      <div className="claim-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="claim-modal-head">
          <div>
            <span className="claim-badge-role">Principal Investigator action</span>
            <h2>Close this trial</h2>
            <p className="claim-sub">
              {claim.nctId} · {where}
            </p>
          </div>
          <button className="claim-close-btn" onClick={onClose} type="button" aria-label="Close">
            ✕
          </button>
        </div>

        {claim.briefTitle && (
          <div className="claim-trial-snippet">
            <div className="claim-trial-title">{claim.briefTitle}</div>
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
  );
}
