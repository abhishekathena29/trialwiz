import { useEffect, useMemo, useState } from 'react';
import { deleteAccountByAdmin, loadDeletionPlan, type DeletionPlan } from '../../services/accountDeletion';
import type { AuditActor } from '../../services/audit';
import { accountLabel, type UserProfile } from '../../types';
import './Admin.css';

interface Props {
  admin: AuditActor;
  account: UserProfile;
  /** Approved PIs (incl. Trial Team Doctors) that coordinators / owned data can move to. */
  approvedPis: UserProfile[];
  onClose: () => void;
  onDeleted: (message: string) => void;
}

const norm = (s?: string) => (s ?? '').trim().toLowerCase();

/** Admin: delete an account, deciding first what happens to everything linked to it. */
export function DeleteAccountModal({ admin, account, approvedPis, onClose, onDeleted }: Props) {
  const [plan, setPlan] = useState<DeletionPlan | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const candidates = useMemo(() => approvedPis.filter((p) => p.uid !== account.uid), [approvedPis, account.uid]);
  // Best guess for a duplicate account: same name, else same hospital; for a coordinator, their own PI.
  const suggested = useMemo(
    () =>
      candidates.find((p) => norm(p.name) === norm(account.name)) ??
      candidates.find((p) => p.uid === account.doctorUid) ??
      candidates.find((p) => norm(p.facility) && norm(p.facility) === norm(account.facility)),
    [candidates, account],
  );
  const [transferUid, setTransferUid] = useState(suggested?.uid ?? '');
  const [coordAction, setCoordAction] = useState<'move' | 'pending'>(suggested ? 'move' : 'pending');
  const [dataAction, setDataAction] = useState<'transfer' | 'delete'>(suggested ? 'transfer' : 'delete');
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadDeletionPlan(account)
      .then((p) => !cancelled && setPlan(p))
      .catch((e) => !cancelled && setLoadErr(e instanceof Error ? e.message : 'Failed to load linked data.'));
    return () => {
      cancelled = true;
    };
  }, [account]);

  const transferTo = candidates.find((p) => p.uid === transferUid);
  const owned = plan ? plan.claims.length + plan.submitted.length + plan.addedSites.length : 0;
  const needsTarget =
    !!plan && ((coordAction === 'move' && plan.coordinators.length > 0) || (dataAction === 'transfer' && owned > 0));
  const blocked = account.role === 'admin' || account.uid === admin.uid;
  const canDelete =
    !busy && !blocked && !!plan && (!needsTarget || !!transferTo) && norm(confirmText) === norm(account.email);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canDelete || !plan) return;
    setBusy(true);
    setErr('');
    try {
      const summary = await deleteAccountByAdmin(admin, account, plan, {
        transferTo,
        coordinators: coordAction,
        data: dataAction,
        reason,
      });
      onDeleted(`Deleted ${account.name} <${account.email}> — ${summary}.`);
      onClose();
    } catch (e) {
      console.error('[TrialWiz] delete account error:', e);
      setErr(e instanceof Error ? e.message : 'Failed to delete the account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="claim-modal-overlay" onClick={onClose}>
      <div className="claim-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580 }}>
        <div className="claim-modal-head">
          <div>
            <span className="claim-badge-role" style={{ background: 'var(--red-w)', color: 'var(--red)' }}>
              Delete Account
            </span>
            <h2>{account.name}</h2>
            <p className="claim-sub">
              {accountLabel(account)} · {account.email}
              {account.facility && ` · ${account.facility}`}
            </p>
          </div>
          <button className="claim-close-btn" onClick={onClose} type="button" aria-label="Close">
            ✕
          </button>
        </div>

        {blocked && (
          <div className="login-err" style={{ margin: '12px 0' }}>
            {account.role === 'admin' ? 'Admin accounts can’t be deleted here.' : 'You can’t delete your own account.'}
          </div>
        )}
        {(err || loadErr) && <div className="login-err" style={{ margin: '12px 0' }}>{err || loadErr}</div>}

        {!plan && !loadErr ? (
          <div className="sup" style={{ padding: '16px 0' }}>Checking what's linked to this account…</div>
        ) : plan ? (
          <form onSubmit={submit} className="claim-form">
            <div className="note">
              <b>Linked to this account:</b> {plan.coordinators.length} coordinator(s) · {plan.claims.length} trial claim(s) ·{' '}
              {plan.submitted.length} submitted trial(s) · {plan.addedSites.length} added location(s)
              {plan.coordinators.length > 0 && (
                <div className="sup" style={{ marginTop: 4 }}>
                  Coordinators: {plan.coordinators.map((c) => `${c.name} (${c.status ?? 'pending'})`).join(', ')}
                </div>
              )}
            </div>

            {(plan.coordinators.length > 0 || owned > 0) && (
              <div className="form-group">
                <label htmlFor="del-transfer">Move to Principal Investigator</label>
                <span className="field-hint">
                  {suggested ? `Suggested: ${suggested.name} — same name or hospital, likely the account to keep.` : 'Pick who takes these over.'}
                </span>
                <select
                  id="del-transfer"
                  className="claim-select"
                  value={transferUid}
                  onChange={(e) => setTransferUid(e.target.value)}
                >
                  <option value="">— nobody —</option>
                  {candidates.map((p) => (
                    <option key={p.uid} value={p.uid}>
                      {p.name} — {p.facility || 'no hospital'} ({p.email})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {plan.coordinators.length > 0 && (
              <div className="form-group">
                <label htmlFor="del-coord">Their coordinators</label>
                <select
                  id="del-coord"
                  className="claim-select"
                  value={coordAction}
                  onChange={(e) => setCoordAction(e.target.value as 'move' | 'pending')}
                >
                  <option value="move">Move to the PI above (stay approved)</option>
                  <option value="pending">Set back to pending — they name a PI again</option>
                </select>
              </div>
            )}

            {owned > 0 && (
              <div className="form-group">
                <label htmlFor="del-data">Their claims, submitted trials and added locations</label>
                <select
                  id="del-data"
                  className="claim-select"
                  value={dataAction}
                  onChange={(e) => setDataAction(e.target.value as 'transfer' | 'delete')}
                >
                  <option value="transfer">Transfer to the PI above</option>
                  <option value="delete">Delete them too</option>
                </select>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="del-reason">Reason (for the audit trail)</label>
              <input
                id="del-reason"
                className="claim-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. duplicate of another account"
              />
            </div>

            <div className="form-group">
              <label htmlFor="del-confirm">
                Type <b>{account.email}</b> to confirm
              </label>
              <input
                id="del-confirm"
                className="claim-input"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="note" style={{ marginTop: 4 }}>
              This can't be undone. The profile, phone numbers and saved trials are removed and the person can no longer sign
              in. Their login is fully erased the next time <code>npm run purge-deleted-accounts</code> runs — until then
              the email can't be used to register again.
            </div>

            <div className="claim-actions" style={{ marginTop: 18 }}>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                <button type="button" className="btn" onClick={onClose} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="btn-danger" disabled={!canDelete}>
                  {busy ? 'Deleting…' : 'Delete account'}
                </button>
              </div>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
