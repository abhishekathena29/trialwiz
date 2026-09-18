import { useState } from 'react';
import { createDoctorAccountByAdmin } from '../../services/profiles';
import './Admin.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (email: string) => void;
}

export function CreateDoctorModal({ isOpen, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [facility, setFacility] = useState('');
  const [city, setCity] = useState('');
  const [stateField, setStateField] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!isOpen) return null;

  const canSubmit =
    !busy &&
    name.trim() &&
    email.trim() &&
    password.length >= 6 &&
    facility.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setErr('');
    try {
      await createDoctorAccountByAdmin({
        name: name.trim(),
        email: email.trim(),
        password,
        facility: facility.trim(),
        city: city.trim() || undefined,
        state: stateField.trim() || undefined,
      });
      onCreated(email.trim());
      onClose();
    } catch (e) {
      console.error('[TrialWiz] admin create doctor error:', e);
      setErr(e instanceof Error ? e.message : 'Failed to create doctor account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="claim-modal-overlay" onClick={onClose}>
      <div className="claim-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className="claim-modal-head">
          <div>
            <span className="claim-badge-role">Admin Account Creation</span>
            <h2>Create Principal Investigator</h2>
            <p className="claim-sub">
              Directly creates a verified doctor account with hospital affiliation.
            </p>
          </div>
          <button className="claim-close-btn" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        {err && <div className="login-err" style={{ margin: '12px 0' }}>{err}</div>}

        <form onSubmit={handleSubmit} className="claim-form">
          <div className="form-group">
            <label htmlFor="admin-doc-name">Doctor Full Name <span className="req">*</span></label>
            <input
              id="admin-doc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dr. Veenoo Agarwal"
              className="claim-input"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group half">
              <label htmlFor="admin-doc-email">Email Address <span className="req">*</span></label>
              <input
                id="admin-doc-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="doctor@hospital.org"
                className="claim-input"
                required
              />
            </div>
            <div className="form-group half">
              <label htmlFor="admin-doc-pass">Initial Password <span className="req">*</span></label>
              <input
                id="admin-doc-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="claim-input"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="admin-doc-facility">Hospital / Institution Name <span className="req">*</span></label>
            <input
              id="admin-doc-facility"
              value={facility}
              onChange={(e) => setFacility(e.target.value)}
              placeholder="e.g. Tata Memorial Centre, Mumbai"
              className="claim-input"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group half">
              <label htmlFor="admin-doc-city">City</label>
              <input
                id="admin-doc-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Mumbai"
                className="claim-input"
              />
            </div>
            <div className="form-group half">
              <label htmlFor="admin-doc-state">State</label>
              <input
                id="admin-doc-state"
                value={stateField}
                onChange={(e) => setStateField(e.target.value)}
                placeholder="e.g. Maharashtra"
                className="claim-input"
              />
            </div>
          </div>

          <div className="note" style={{ marginTop: 12 }}>
            <b>Auto-Approved:</b> Accounts created by administrators are immediately set to <code>approved</code> status.
            The Principal Investigator can immediately sign in at <code>/portal</code> to claim trials and approve coordinators.
          </div>

          <div className="claim-actions" style={{ marginTop: 18 }}>
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={!canSubmit}>
              {busy ? 'Creating Account…' : 'Create & Verify Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
