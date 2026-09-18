import { useState } from 'react';
import { claimTrial, makeClaimId, unclaimTrial } from '../../services/trialClaims';
import type { TrialClaim, TrialSite, UserProfile } from '../../types';
import './Portal.css';

interface Props {
  trial: TrialSite;
  profile: UserProfile;
  existingClaim?: TrialClaim;
  savedPhones?: string[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ClaimTrialModal({
  trial,
  profile,
  existingClaim,
  savedPhones = [],
  isOpen,
  onClose,
  onSuccess,
}: Props) {
  // Candidate phone options: registry phone, saved phones from profile or other claims
  const initialAvailablePhones = Array.from(
    new Set(
      [existingClaim?.contactPhone, trial.contactPhone, ...savedPhones]
        .filter(Boolean)
        .map((p) => String(p).trim()),
    ),
  );

  const [selectedPhoneOption, setSelectedPhoneOption] = useState<string>(
    existingClaim?.contactPhone || initialAvailablePhones[0] || 'custom',
  );
  const [customPhone, setCustomPhone] = useState<string>(
    existingClaim?.contactPhone || (!initialAvailablePhones.length ? '' : ''),
  );
  const [contactName, setContactName] = useState<string>(
    existingClaim?.contactName || profile.name || '',
  );
  const [contactEmail, setContactEmail] = useState<string>(
    existingClaim?.contactEmail || profile.email || '',
  );
  const [department, setDepartment] = useState<string>(
    existingClaim?.department || 'Oncology Clinical Trials Unit',
  );
  const [notes, setNotes] = useState<string>(
    existingClaim?.notes || '',
  );
  const [confirmed, setConfirmed] = useState<boolean>(
    Boolean(existingClaim?.confirmedPrincipalInvestigator),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!isOpen) return null;

  const resolvedPhone =
    selectedPhoneOption === 'custom' ? customPhone.trim() : selectedPhoneOption.trim();
  const canSave = !busy && confirmed && resolvedPhone.length >= 7 && contactEmail.trim().length > 0;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setErr('');
    try {
      const claimId = existingClaim?.id || makeClaimId(trial.nctId, trial.facility);
      await claimTrial({
        id: claimId,
        nctId: trial.nctId,
        facility: trial.facility,
        city: trial.city,
        state: trial.state,
        briefTitle: trial.briefTitle,
        cancerType: trial.cancerType,
        claimedByUid: profile.uid,
        claimedByName: profile.name,
        claimedByRole: profile.role,
        claimedByEmail: profile.email,
        contactPhone: resolvedPhone,
        contactEmail: contactEmail.trim(),
        contactName: contactName.trim(),
        department: department.trim() || undefined,
        notes: notes.trim() || undefined,
        confirmedPrincipalInvestigator: confirmed,
      });
      onSuccess?.();
      onClose();
    } catch (e) {
      console.error('[TrialWiz] claim trial error:', e);
      setErr(e instanceof Error ? e.message : 'Failed to claim trial. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUnclaim() {
    if (!existingClaim) return;
    if (!window.confirm('Are you sure you want to release and unclaim this trial for your center?')) return;
    setBusy(true);
    setErr('');
    try {
      await unclaimTrial(existingClaim.id);
      onSuccess?.();
      onClose();
    } catch (e) {
      console.error('[TrialWiz] unclaim error:', e);
      setErr(e instanceof Error ? e.message : 'Failed to release claim.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="claim-modal-overlay" onClick={onClose}>
      <div className="claim-modal" onClick={(e) => e.stopPropagation()}>
        <div className="claim-modal-head">
          <div>
            <span className="claim-badge-role">
              {profile.role === 'doctor' ? 'Principal Investigator Verification' : 'Clinical Study Team Claim'}
            </span>
            <h2>{existingClaim ? 'Manage Trial Claim' : 'Claim this Clinical Trial'}</h2>
            <p className="claim-sub">
              {trial.nctId} · {trial.facility}{trial.city ? `, ${trial.city}` : ''}
            </p>
          </div>
          <button className="claim-close-btn" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <div className="claim-trial-snippet">
          <div className="claim-trial-title">{trial.briefTitle}</div>
          <div className="claim-trial-meta">
            <span><b>Cancer Type:</b> {trial.cancerType}</span>
            <span><b>Status:</b> {trial.overallStatus}</span>
            {trial.phases.length > 0 && <span><b>Phase:</b> {trial.phases.join(', ')}</span>}
          </div>
        </div>

        {err && <div className="login-err" style={{ margin: '12px 0' }}>{err}</div>}

        <form onSubmit={handleSave} className="claim-form">
          {/* Checkbox confirmation */}
          <div className="claim-confirm-card">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                required
              />
              <span>
                <b>I confirm that I am the Principal Investigator</b> (or authorized clinical study coordinator)
                for this clinical trial at <b>{trial.facility}</b>.
              </span>
            </label>
          </div>

          {/* Contact Phone Number: Dropdown + Custom */}
          <div className="form-group">
            <label htmlFor="claim-phone-select">
              Center Contact Phone Number <span className="req">*</span>
            </label>
            <span className="field-hint">
              Select an existing contact phone for your site or enter a new direct line for patient and oncologist inquiries.
            </span>
            <select
              id="claim-phone-select"
              value={selectedPhoneOption}
              onChange={(e) => {
                setSelectedPhoneOption(e.target.value);
                if (e.target.value !== 'custom') {
                  setCustomPhone(e.target.value);
                }
              }}
              className="claim-select"
            >
              {initialAvailablePhones.map((ph) => (
                <option key={ph} value={ph}>
                  📞 {ph} {trial.contactPhone === ph ? '(Registry default)' : '(Saved site number)'}
                </option>
              ))}
              <option value="custom">➕ Add or enter a new contact phone number...</option>
            </select>

            {(selectedPhoneOption === 'custom' || !initialAvailablePhones.includes(selectedPhoneOption)) && (
              <input
                type="tel"
                value={customPhone}
                onChange={(e) => setCustomPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210 or 022-24177000"
                className="claim-input"
                style={{ marginTop: 8 }}
                required
              />
            )}
          </div>

          <div className="form-row">
            <div className="form-group half">
              <label htmlFor="claim-contact-name">
                Lead Contact / PI Name <span className="req">*</span>
              </label>
              <input
                id="claim-contact-name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="e.g. Dr. A. Sharma"
                className="claim-input"
                required
              />
            </div>
            <div className="form-group half">
              <label htmlFor="claim-contact-email">
                Inquiry Email Address <span className="req">*</span>
              </label>
              <input
                id="claim-contact-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="pi@hospital.org"
                className="claim-input"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="claim-department">Department / Clinic Unit (optional)</label>
            <input
              id="claim-department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Department of Medical Oncology, Room 204"
              className="claim-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="claim-notes">Screening & Patient Referral Notes (optional)</label>
            <textarea
              id="claim-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Screening OPD open Mon-Fri 9 AM - 2 PM. Referring oncologists may call the study coordinator directly."
              className="claim-textarea"
              rows={2}
            />
          </div>

          <div className="claim-actions">
            {existingClaim && (
              <button
                type="button"
                className="btn-danger"
                onClick={handleUnclaim}
                disabled={busy}
              >
                Release Claim
              </button>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
              <button type="button" className="btn" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={!canSave}>
                {busy ? 'Saving…' : existingClaim ? 'Update Claim' : 'Confirm & Claim Trial'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
