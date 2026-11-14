import { useState } from 'react';
import { SpecializationOptions } from '../../components/SpecializationOptions';
import type { AuditActor } from '../../services/audit';
import { createAccountByAdmin, type NewAccountRole } from '../../services/profiles';
import type { UserProfile } from '../../types';
import './Admin.css';

const ROLE_OPTIONS: Array<{ key: NewAccountRole; label: string }> = [
  { key: 'pi', label: 'Principal Investigator' },
  { key: 'coordinator', label: 'Trial Coordinator' },
  { key: 'doctor', label: 'Doctor' },
  { key: 'individual', label: 'Individual' },
];

interface Props {
  /** The signed-in admin — recorded as the authorizer of a new PI. */
  admin: AuditActor;
  /** Approved PIs — a new trial coordinator must be placed under one of them. */
  approvedPis: UserProfile[];
  onClose: () => void;
  onCreated: (message: string) => void;
}

/** Admin-only: creates an account of any role. Admin-created accounts are approved immediately. */
export function CreateAccountModal({ admin, approvedPis, onClose, onCreated }: Props) {
  const [role, setRole] = useState<NewAccountRole>('pi');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [publicPhone, setPublicPhone] = useState('');
  const [privatePhone, setPrivatePhone] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [facility, setFacility] = useState('');
  const [city, setCity] = useState('');
  const [stateField, setStateField] = useState('');
  const [supervisorUid, setSupervisorUid] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const supervisor = approvedPis.find((d) => d.uid === supervisorUid);
  const twoPhones = role === 'pi' || role === 'doctor';
  const roleLabel = ROLE_OPTIONS.find((r) => r.key === role)!.label;

  const canSubmit =
    !busy &&
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= 6 &&
    (role !== 'pi' || facility.trim().length > 0) &&
    (role !== 'coordinator' || Boolean(supervisor));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setErr('');
    try {
      await createAccountByAdmin({
        role,
        name,
        email,
        password,
        facility,
        city,
        state: stateField,
        supervisor,
        admin,
        specialization: twoPhones ? specialization : undefined,
        phones: twoPhones ? { publicPhone, phone: privatePhone } : { phone: privatePhone },
      });
      onCreated(`${roleLabel} account created for ${email.trim()} — approved and ready to sign in at /login.`);
      onClose();
    } catch (e) {
      console.error('[TrialWiz] admin create account error:', e);
      setErr(e instanceof Error ? e.message : 'Failed to create the account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="claim-modal-overlay" onClick={onClose}>
      <div className="claim-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="claim-modal-head">
          <div>
            <span className="claim-badge-role">Admin Account Creation</span>
            <h2>Create account</h2>
            <p className="claim-sub">Accounts created by an admin are approved immediately.</p>
          </div>
          <button className="claim-close-btn" onClick={onClose} type="button" aria-label="Close">
            ✕
          </button>
        </div>

        {err && <div className="login-err" style={{ margin: '12px 0' }}>{err}</div>}

        <form onSubmit={handleSubmit} className="claim-form">
          <div className="form-group">
            <label htmlFor="acct-role">
              Account type <span className="req">*</span>
            </label>
            <select
              id="acct-role"
              className="claim-select"
              value={role}
              onChange={(e) => setRole(e.target.value as NewAccountRole)}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {role === 'coordinator' && (
            <div className="form-group">
              <label htmlFor="acct-supervisor">
                Works under (Principal Investigator) <span className="req">*</span>
              </label>
              {approvedPis.length === 0 ? (
                <div className="sup">Create and approve a Principal Investigator first.</div>
              ) : (
                <select
                  id="acct-supervisor"
                  className="claim-select"
                  value={supervisorUid}
                  onChange={(e) => setSupervisorUid(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select a Principal Investigator…
                  </option>
                  {approvedPis.map((d) => (
                    <option key={d.uid} value={d.uid}>
                      {d.name} — {d.facility || 'no hospital'} ({d.email})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="acct-name">
              Full name <span className="req">*</span>
            </label>
            <input
              id="acct-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={role === 'pi' || role === 'doctor' ? 'Dr. Firstname Lastname' : 'Firstname Lastname'}
              className="claim-input"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group half">
              <label htmlFor="acct-email">
                Email <span className="req">*</span>
              </label>
              <input
                id="acct-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@hospital.org"
                className="claim-input"
                autoComplete="off"
                required
              />
            </div>
            <div className="form-group half">
              <label htmlFor="acct-pass">
                Initial password <span className="req">*</span>
              </label>
              <input
                id="acct-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="claim-input"
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          {twoPhones && (
            <div className="form-group">
              <label htmlFor="acct-spec">Specialization</label>
              <input
                id="acct-spec"
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                placeholder="e.g. Medical Oncology, Radiation Oncology"
                className="claim-input"
                list="specialization-options"
              />
              <SpecializationOptions />
            </div>
          )}

          {twoPhones ? (
            <div className="form-row">
              <div className="form-group half">
                <label htmlFor="acct-pubphone">Public phone</label>
                <span className="field-hint">
                  {role === 'pi' ? 'Shown as the contact on trials they claim.' : 'May be shown publicly.'}
                </span>
                <input
                  id="acct-pubphone"
                  type="tel"
                  value={publicPhone}
                  onChange={(e) => setPublicPhone(e.target.value)}
                  placeholder="+91 11 2658 8500"
                  className="claim-input"
                  autoComplete="off"
                />
              </div>
              <div className="form-group half">
                <label htmlFor="acct-privphone">Private phone</label>
                <span className="field-hint">Only the user and admins see this.</span>
                <input
                  id="acct-privphone"
                  type="tel"
                  value={privatePhone}
                  onChange={(e) => setPrivatePhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="claim-input"
                  autoComplete="off"
                />
              </div>
            </div>
          ) : (
            <div className="form-group">
              <label htmlFor="acct-privphone">Phone</label>
              <span className="field-hint">Only the user and admins see this.</span>
              <input
                id="acct-privphone"
                type="tel"
                value={privatePhone}
                onChange={(e) => setPrivatePhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="claim-input"
                autoComplete="off"
              />
            </div>
          )}

          {(role === 'pi' || role === 'coordinator') && (
            <>
              <div className="form-group">
                <label htmlFor="acct-facility">
                  Hospital / Institution {role === 'pi' && <span className="req">*</span>}
                </label>
                {role === 'coordinator' && (
                  <span className="field-hint">Leave blank to use the Principal Investigator's hospital.</span>
                )}
                <input
                  id="acct-facility"
                  value={facility}
                  onChange={(e) => setFacility(e.target.value)}
                  placeholder={supervisor?.facility || 'e.g. AIIMS New Delhi, Tata Memorial Centre'}
                  className="claim-input"
                  required={role === 'pi'}
                />
              </div>
              <div className="form-row">
                <div className="form-group half">
                  <label htmlFor="acct-city">City</label>
                  <input
                    id="acct-city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder={supervisor?.city || 'e.g. New Delhi'}
                    className="claim-input"
                  />
                </div>
                <div className="form-group half">
                  <label htmlFor="acct-state">State</label>
                  <input
                    id="acct-state"
                    value={stateField}
                    onChange={(e) => setStateField(e.target.value)}
                    placeholder={supervisor?.state || 'e.g. Delhi'}
                    className="claim-input"
                  />
                </div>
              </div>
            </>
          )}

          <div className="note" style={{ marginTop: 12 }}>
            <b>Auto-approved.</b> Share the email and initial password with the user — they sign in at{' '}
            <code>/login</code> and land on the right page for their role.
            {role === 'coordinator' && ' The coordinator is linked to the chosen PI straight away; no PI approval needed.'}
          </div>

          <div className="claim-actions" style={{ marginTop: 18 }}>
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={!canSubmit}>
              {busy ? 'Creating…' : `Create ${roleLabel}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
