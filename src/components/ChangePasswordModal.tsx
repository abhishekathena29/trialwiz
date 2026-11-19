import { EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail, updatePassword, type User } from 'firebase/auth';
import { useState } from 'react';
import { auth } from '../firebase';
import { friendlyAuthError } from '../utils/authErrors';

const authErrorMessage = (e: unknown) =>
  e instanceof Error ? friendlyAuthError(e.message) : 'Something went wrong — please try again.';
import '../pages/Admin/Admin.css';
import '../pages/Portal/Portal.css';

interface Props {
  user: User;
  onClose: () => void;
  onChanged?: (message: string) => void;
}

/** Any signed-in account changes its own password. Firebase requires a recent sign-in for this,
 * so the current password is asked for and used to re-authenticate first. */
export function ChangePasswordModal({ user, onClose, onChanged }: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const mismatch = confirm.length > 0 && next !== confirm;
  const canSave = !busy && current.length > 0 && next.length >= 6 && next === confirm && next !== current;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || !user.email) return;
    setBusy(true);
    setErr('');
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
      await updatePassword(user, next);
      onChanged?.('Password changed. Use the new password next time you sign in.');
      onClose();
    } catch (e) {
      console.error('[TrialWiz] change password failed:', e);
      setErr(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function sendReset() {
    if (!auth || !user.email) return;
    setErr('');
    try {
      await sendPasswordResetEmail(auth, user.email);
      setInfo(`Password reset link sent to ${user.email}.`);
    } catch (e) {
      setErr(authErrorMessage(e));
    }
  }

  return (
    <div className="tw-admin">
      <div className="claim-modal-overlay" onClick={onClose}>
        <div className="claim-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
          <div className="claim-modal-head">
            <div>
              <h2>Change password</h2>
              <p className="claim-sub">{user.email}</p>
            </div>
            <button className="claim-close-btn" onClick={onClose} type="button" aria-label="Close">
              ✕
            </button>
          </div>

          {err && <div className="login-err" style={{ margin: '12px 0' }}>{err}</div>}
          {info && (
            <div className="note" style={{ background: '#e3f7e9', color: '#16794b', borderColor: '#a3e6b7' }}>
              ✓ {info}
            </div>
          )}

          <form onSubmit={submit} className="claim-form">
            <div className="form-group">
              <label htmlFor="pw-current">Current password</label>
              <input
                id="pw-current"
                className="claim-input"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
              <button type="button" className="linkbtn" onClick={sendReset} style={{ marginTop: 4, fontSize: 12 }}>
                Forgot it? Email me a reset link instead
              </button>
            </div>
            <div className="form-group">
              <label htmlFor="pw-new">New password (at least 6 characters)</label>
              <input
                id="pw-new"
                className="claim-input"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="pw-confirm">Confirm new password</label>
              <input
                id="pw-confirm"
                className="claim-input"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              {mismatch && <div className="login-err">Passwords don't match yet.</div>}
              {next.length > 0 && next === current && <div className="login-err">Pick a password different from the current one.</div>}
            </div>
            <label className="checkbox-label" style={{ fontSize: 12.5 }}>
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
            </label>

            <div className="claim-actions" style={{ marginTop: 18 }}>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                <button type="button" className="btn" onClick={onClose} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={!canSave}>
                  {busy ? 'Saving…' : 'Change password'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
