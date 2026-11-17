import { useEffect, useRef, useState } from 'react';
import type { AuditActor } from '../services/audit';
import { subscribeUserContact, updateAccountByAdmin, updateOwnAccount } from '../services/profiles';
import { accountLabel, type PiTitle, type UserProfile } from '../types';
import { SpecializationOptions } from './SpecializationOptions';
import '../pages/Admin/Admin.css';
import '../pages/Portal/Portal.css';

interface Props {
  account: UserProfile;
  /** 'admin': any field, audited. 'self': the signed-in user editing their own profile. */
  mode: 'admin' | 'self';
  /** Required in admin mode — recorded in the audit trail. */
  admin?: AuditActor;
  onClose: () => void;
  onSaved?: (message: string) => void;
}

/** Which accounts have a clinical specialization and a public phone (PIs and doctors). */
function isClinician(a: UserProfile): boolean {
  return a.role === 'doctor' || (a.role === 'user' && a.userType === 'doctor');
}

/** Edit an account's name, hospital, location, specialization and phone numbers. */
export function EditAccountModal({ account, mode, admin, onClose, onSaved }: Props) {
  const [name, setName] = useState(account.name ?? '');
  const [facility, setFacility] = useState(account.facility ?? '');
  const [city, setCity] = useState(account.city ?? '');
  const [stateField, setStateField] = useState(account.state ?? '');
  const [specialization, setSpecialization] = useState(account.specialization ?? '');
  const [piTitle, setPiTitle] = useState<PiTitle>(account.piTitle ?? 'pi');
  const [phone, setPhone] = useState('');
  const [publicPhone, setPublicPhone] = useState('');
  const [loadedPhones, setLoadedPhones] = useState<{ phone: string; publicPhone: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const seeded = useRef(false);
  useEffect(
    () =>
      subscribeUserContact(account.uid, (c) => {
        if (seeded.current) return; // seed the form once; later snapshots mustn't clobber typing
        seeded.current = true;
        setPhone(c?.phone ?? '');
        setPublicPhone(c?.publicPhone ?? '');
        setLoadedPhones({ phone: c?.phone ?? '', publicPhone: c?.publicPhone ?? '' });
      }),
    [account.uid],
  );

  const clinician = isClinician(account);
  const hasHospital = account.role !== 'user' && account.role !== 'admin';
  // firestore.rules: a verified PI's hospital decides which PIs they may authorize — admin-only.
  const hospitalLocked = mode === 'self' && account.role === 'doctor' && account.status === 'approved';
  const canSave = !busy && loadedPhones !== null && name.trim().length > 0 && (!hasHospital || account.role !== 'doctor' || facility.trim().length > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setErr('');
    const edit = {
      name,
      ...(hasHospital && !hospitalLocked ? { facility, city, state: stateField } : {}),
      ...(hasHospital && hospitalLocked ? { city, state: stateField } : {}),
      ...(clinician ? { specialization } : {}),
      ...(mode === 'admin' && account.role === 'doctor' ? { piTitle } : {}),
    };
    const phones = { phone, publicPhone: clinician ? publicPhone : '' };
    try {
      if (mode === 'admin') {
        if (!admin) throw new Error('Admin session missing.');
        await updateAccountByAdmin(admin, account, edit, phones, loadedPhones ?? {});
        onSaved?.(`Saved changes to ${name.trim()}'s account.`);
      } else {
        await updateOwnAccount(account, edit, phones);
        onSaved?.('Your profile has been updated.');
      }
      onClose();
    } catch (e) {
      console.error('[TrialWiz] edit account error:', e);
      setErr(e instanceof Error ? e.message : 'Failed to save changes.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="claim-modal-overlay" onClick={onClose}>
      <div className="claim-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="claim-modal-head">
          <div>
            <span className="claim-badge-role">{mode === 'admin' ? 'Admin · Edit Account' : 'My Profile'}</span>
            <h2>{mode === 'admin' ? account.name : 'Edit your details'}</h2>
            <p className="claim-sub">
              {accountLabel(account)} · {account.email}
            </p>
          </div>
          <button className="claim-close-btn" onClick={onClose} type="button" aria-label="Close">
            ✕
          </button>
        </div>

        {err && <div className="login-err" style={{ margin: '12px 0' }}>{err}</div>}

        <form onSubmit={submit} className="claim-form">
          <div className="form-group">
            <label htmlFor="edit-name">
              Full name <span className="req">*</span>
            </label>
            <input id="edit-name" className="claim-input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          {mode === 'admin' && account.role === 'doctor' && (
            <div className="form-group">
              <label htmlFor="edit-title">Account type</label>
              <span className="field-hint">Same features either way — only the label shown on the account and its claims.</span>
              <select
                id="edit-title"
                className="claim-select"
                value={piTitle}
                onChange={(e) => setPiTitle(e.target.value as PiTitle)}
              >
                <option value="pi">Principal Investigator</option>
                <option value="trialDoctor">Trial Team Doctor</option>
              </select>
            </div>
          )}

          {hasHospital && (
            <>
              <div className="form-group">
                <label htmlFor="edit-facility">Hospital / Institution</label>
                {hospitalLocked && (
                  <span className="field-hint">
                    A verified Principal Investigator's hospital can only be changed by TrialWiz admin — contact admin to
                    move hospitals.
                  </span>
                )}
                {mode === 'admin' && account.role === 'doctor' && account.status === 'approved' && (
                  <span className="field-hint">
                    This PI can authorize other PIs registered at exactly this hospital name — keep it consistent with
                    their colleagues' accounts.
                  </span>
                )}
                <input
                  id="edit-facility"
                  className="claim-input"
                  value={facility}
                  onChange={(e) => setFacility(e.target.value)}
                  disabled={hospitalLocked}
                />
              </div>
              <div className="form-row">
                <div className="form-group half">
                  <label htmlFor="edit-city">City</label>
                  <input id="edit-city" className="claim-input" value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div className="form-group half">
                  <label htmlFor="edit-state">State</label>
                  <input id="edit-state" className="claim-input" value={stateField} onChange={(e) => setStateField(e.target.value)} />
                </div>
              </div>
            </>
          )}

          {clinician && (
            <div className="form-group">
              <label htmlFor="edit-spec">Specialization</label>
              <input
                id="edit-spec"
                className="claim-input"
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                list="specialization-options"
              />
              <SpecializationOptions />
            </div>
          )}

          <div className="form-row">
            {clinician && (
              <div className="form-group half">
                <label htmlFor="edit-pubphone">Public phone</label>
                <span className="field-hint">Default contact on trials they claim.</span>
                <input
                  id="edit-pubphone"
                  type="tel"
                  className="claim-input"
                  value={publicPhone}
                  onChange={(e) => setPublicPhone(e.target.value)}
                  disabled={loadedPhones === null}
                />
              </div>
            )}
            <div className={clinician ? 'form-group half' : 'form-group'}>
              <label htmlFor="edit-phone">{clinician ? 'Private phone' : 'Phone'}</label>
              <span className="field-hint">Only the account owner and admins see this.</span>
              <input
                id="edit-phone"
                type="tel"
                className="claim-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loadedPhones === null}
              />
            </div>
          </div>

          {mode === 'admin' && <div className="note" style={{ marginTop: 12 }}>Changes are recorded in the audit trail.</div>}

          <div className="claim-actions" style={{ marginTop: 18 }}>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
              <button type="button" className="btn" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={!canSave}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
