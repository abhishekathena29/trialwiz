import { useState } from 'react';
import type { AuditActor } from '../../services/audit';
import { changePiToCoordinator } from '../../services/profiles';
import type { UserProfile } from '../../types';
import './Admin.css';

interface Props {
  admin: AuditActor;
  /** The Principal Investigator being changed to a trial coordinator. */
  pi: UserProfile;
  /** Approved PIs the new coordinator can be placed under. */
  approvedPis: UserProfile[];
  /** How many coordinators currently name this PI — they lose their approving PI. */
  linkedCoordinatorCount: number;
  onClose: () => void;
  onChanged: (message: string) => void;
}

export function ChangeRoleModal({ admin, pi, approvedPis, linkedCoordinatorCount, onClose, onChanged }: Props) {
  const candidates = approvedPis.filter((d) => d.uid !== pi.uid);
  const sameHospital = candidates.find(
    (d) => (d.facility ?? '').trim().toLowerCase() === (pi.facility ?? '').trim().toLowerCase(),
  );
  const [supervisorUid, setSupervisorUid] = useState(sameHospital?.uid ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const supervisor = candidates.find((d) => d.uid === supervisorUid);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supervisor) return;
    setBusy(true);
    setErr('');
    try {
      await changePiToCoordinator(admin, pi, supervisor);
      onChanged(`${pi.name} is now a Trial Coordinator under ${supervisor.name}.`);
      onClose();
    } catch (e) {
      console.error('[TrialWiz] role change error:', e);
      setErr(e instanceof Error ? e.message : 'Failed to change role.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="claim-modal-overlay" onClick={onClose}>
      <div className="claim-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="claim-modal-head">
          <div>
            <span className="claim-badge-role">Change Role</span>
            <h2>Principal Investigator → Trial Coordinator</h2>
            <p className="claim-sub">
              {pi.name} · {pi.email}
            </p>
          </div>
          <button className="claim-close-btn" onClick={onClose} type="button" aria-label="Close">
            ✕
          </button>
        </div>

        {err && <div className="login-err" style={{ margin: '12px 0' }}>{err}</div>}

        <form onSubmit={submit} className="claim-form">
          <div className="form-group">
            <label htmlFor="role-supervisor">
              Supervising Principal Investigator <span className="req">*</span>
            </label>
            <span className="field-hint">The coordinator will work under, and be approved for, this PI.</span>
            {candidates.length === 0 ? (
              <div className="sup">There are no other approved Principal Investigators to place this account under.</div>
            ) : (
              <select
                id="role-supervisor"
                className="claim-select"
                value={supervisorUid}
                onChange={(e) => setSupervisorUid(e.target.value)}
                required
              >
                <option value="" disabled>
                  Select a Principal Investigator…
                </option>
                {candidates.map((d) => (
                  <option key={d.uid} value={d.uid}>
                    {d.name} — {d.facility || 'no hospital'} ({d.email})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="note" style={{ marginTop: 12 }}>
            Trials this person has already claimed stay claimed. As a coordinator they can no longer close trials or
            approve coordinators.
            {linkedCoordinatorCount > 0 && (
              <>
                {' '}
                <b>
                  {linkedCoordinatorCount} coordinator{linkedCoordinatorCount === 1 ? '' : 's'} currently name
                  {linkedCoordinatorCount === 1 ? 's' : ''} this PI
                </b>{' '}
                — they keep their approval but will need a new PI to approve anyone new.
              </>
            )}{' '}
            The change is recorded in the audit trail.
          </div>

          <div className="claim-actions" style={{ marginTop: 18 }}>
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy || !supervisor}>
              {busy ? 'Changing…' : 'Change to Trial Coordinator'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
