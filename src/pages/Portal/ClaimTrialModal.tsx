import { useState } from 'react';
import { teamPiUidOf } from '../../services/addedSites';
import {
  claimMatchesSite,
  claimTrial,
  makeClaimId,
  savePrivateContact,
  unclaimTrial,
  updateClaimAsTeammate,
} from '../../services/trialClaims';
import { ROLE_LABEL, accountLabel, type ClaimPrivateContact, type ContactVisibility, type TrialClaim, type UserProfile } from '../../types';
import type { GroupedTrial, TrialLocation } from '../../utils/groupTrials';
import './Portal.css';

function siteLabel(site: TrialLocation): string {
  return [site.facility, site.city, site.state].filter(Boolean).join(', ');
}

function VisibilityToggle({
  value,
  onChange,
  label,
}: {
  value: ContactVisibility;
  onChange: (v: ContactVisibility) => void;
  label: string;
}) {
  return (
    <div className="vis-toggle" role="radiogroup" aria-label={`${label} visibility`}>
      <button type="button" role="radio" aria-checked={value === 'public'} className={value === 'public' ? 'on' : ''} onClick={() => onChange('public')}>
        Public
      </button>
      <button type="button" role="radio" aria-checked={value === 'personal'} className={value === 'personal' ? 'on' : ''} onClick={() => onChange('personal')}>
        Personal
      </button>
    </div>
  );
}

interface Props {
  /** The whole study with every site it runs at — the PI picks which location they're claiming. */
  trial: GroupedTrial;
  profile: UserProfile;
  existingClaim?: TrialClaim;
  /** All claims, so sites already claimed by someone else can't be claimed twice. */
  allClaims: TrialClaim[];
  /** Site to preselect for a new claim (usually the one matching the PI's hospital). */
  defaultSiteKey?: string;
  savedPhones?: string[];
  /** The claimant's own public phone from their account — preselected for new claims. */
  defaultPhone?: string;
  /** The claimant's own personal (non-public) phone/email for this claim, if any. */
  privateContact?: ClaimPrivateContact;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ClaimTrialModal({
  trial,
  profile,
  existingClaim,
  allClaims,
  defaultSiteKey,
  savedPhones = [],
  defaultPhone = '',
  privateContact,
  isOpen,
  onClose,
  onSuccess,
}: Props) {
  function claimedByOther(site: TrialLocation): TrialClaim | undefined {
    return allClaims.find((c) => c.id !== existingClaim?.id && claimMatchesSite(c, trial.nctId, site));
  }

  // An existing claim stays pinned to its location; to move it, release and claim the other site.
  const existingSite = existingClaim
    ? trial.sites.find((s) => claimMatchesSite(existingClaim, trial.nctId, s))
    : undefined;
  const [siteKey, setSiteKey] = useState<string>(
    existingSite?.key ??
      (existingClaim ? '' : (defaultSiteKey ?? trial.sites.find((s) => !claimedByOther(s))?.key ?? '')),
  );
  const site = trial.sites.find((s) => s.key === siteKey);
  // A teammate (the claimant's PI, or a fellow coordinator / trial team doctor) can keep the
  // claim's public contact details current, but the claim — and any personal contact — stays the
  // claimant's.
  const isTeammateEdit = Boolean(existingClaim && existingClaim.claimedByUid !== profile.uid);
  const hospitalName = (isTeammateEdit ? existingClaim?.hospitalName : profile.facility ?? '')?.trim() ?? '';

  // Personal values aren't on the public claim doc — they come from the owner-only private doc.
  const existingPhone = existingClaim?.contactPhone || privateContact?.contactPhone || '';
  const existingEmail = existingClaim?.contactEmail || privateContact?.contactEmail || '';

  // Candidate phone options: registry phone, saved phones from profile or other claims
  const initialAvailablePhones = Array.from(
    new Set(
      [existingPhone, defaultPhone, site?.contactPhone, ...savedPhones]
        .filter(Boolean)
        .map((p) => String(p).trim()),
    ),
  );

  const [selectedPhoneOption, setSelectedPhoneOption] = useState<string>(
    existingPhone || initialAvailablePhones[0] || 'custom',
  );
  const [customPhone, setCustomPhone] = useState<string>(existingPhone);
  const [phoneVisibility, setPhoneVisibility] = useState<ContactVisibility>(existingClaim?.phoneVisibility ?? 'public');
  const [emailVisibility, setEmailVisibility] = useState<ContactVisibility>(existingClaim?.emailVisibility ?? 'public');
  const [contactName, setContactName] = useState<string>(
    existingClaim?.contactName || profile.name || '',
  );
  const [contactEmail, setContactEmail] = useState<string>(
    existingEmail || profile.email || '',
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
  const locationOk = Boolean(existingClaim || (site && !claimedByOther(site)));
  // On a teammate edit, a field the claimant kept personal is locked (it's not on the public doc).
  const phoneLocked = isTeammateEdit && phoneVisibility === 'personal';
  const emailLocked = isTeammateEdit && emailVisibility === 'personal';
  const canSave =
    !busy &&
    (confirmed || isTeammateEdit) &&
    locationOk &&
    hospitalName.length > 0 &&
    (phoneLocked || resolvedPhone.length >= 7) &&
    (emailLocked || contactEmail.trim().length > 0);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setErr('');
    if (isTeammateEdit && existingClaim) {
      try {
        await updateClaimAsTeammate(
          existingClaim.id,
          {
            contactName,
            ...(phoneLocked ? {} : { contactPhone: resolvedPhone }),
            ...(emailLocked ? {} : { contactEmail }),
            department,
            notes,
          },
          profile.name,
        );
        onSuccess?.();
        onClose();
      } catch (e) {
        console.error('[TrialWiz] teammate claim edit error:', e);
        setErr(
          e instanceof Error && /permission/i.test(e.message)
            ? 'Not permitted — only the claimant and their Principal Investigator’s team can edit this claim.'
            : e instanceof Error
              ? e.message
              : 'Failed to update the claim.',
        );
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      // Legacy claims may point at a site no longer in the registry feed — keep their stored location.
      const facility = site?.facility ?? existingClaim?.facility ?? '';
      const city = site?.city ?? existingClaim?.city;
      const state = site?.state ?? existingClaim?.state;
      const claimId = existingClaim?.id || makeClaimId(trial.nctId, facility, city);
      await claimTrial({
        id: claimId,
        nctId: trial.nctId,
        facility,
        city,
        state,
        hospitalName,
        briefTitle: trial.briefTitle,
        cancerType: trial.cancerType,
        claimedByUid: profile.uid,
        claimedByName: profile.name,
        claimedByRole: profile.role === 'doctor' ? 'doctor' : 'coordinator',
        claimedByTitle: accountLabel(profile),
        claimedByEmail: profile.email,
        teamPiUid: existingClaim?.teamPiUid ?? teamPiUidOf(profile),
        // Personal fields are left blank on the public doc; public pages then fall back to the
        // registry's own site contact.
        contactPhone: phoneVisibility === 'public' ? resolvedPhone : '',
        contactEmail: emailVisibility === 'public' ? contactEmail.trim() : '',
        contactName: contactName.trim(),
        phoneVisibility,
        emailVisibility,
        department: department.trim() || undefined,
        notes: notes.trim() || undefined,
        confirmedPrincipalInvestigator: confirmed,
      });
      await savePrivateContact(
        claimId,
        profile.uid,
        phoneVisibility === 'personal' ? resolvedPhone : '',
        emailVisibility === 'personal' ? contactEmail.trim() : '',
      );
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
              {isTeammateEdit
                ? 'Team Edit'
                : profile.role === 'doctor'
                  ? `${accountLabel(profile)} Verification`
                  : 'Clinical Study Team Claim'}
            </span>
            <h2>{isTeammateEdit ? 'Edit Team Claim' : existingClaim ? 'Manage Trial Claim' : 'Claim this Clinical Trial'}</h2>
            {isTeammateEdit && existingClaim && (
              <p className="claim-sub">
                Claimed by {existingClaim.claimedByName} ({existingClaim.claimedByTitle ?? ROLE_LABEL[existingClaim.claimedByRole] ?? existingClaim.claimedByRole}) —
                you can update its public contact details as part of the same trial team.
              </p>
            )}
            <p className="claim-sub">
              {trial.nctId}
              {trial.sites.length > 1 ? ` · runs at ${trial.sites.length} locations` : ''}
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
          {/* Location — the same NCT ID can run at many sites */}
          <div className="form-group">
            <label htmlFor="claim-site-select">
              Trial Location <span className="req">*</span>
            </label>
            <span className="field-hint">
              {existingClaim
                ? 'This claim is tied to the location below. To claim a different location, release this claim first.'
                : 'This study runs at multiple sites — choose the location you lead the trial at.'}
            </span>
            {existingClaim ? (
              <input
                id="claim-site-select"
                className="claim-input"
                value={site ? siteLabel(site) : [existingClaim.facility, existingClaim.city, existingClaim.state].filter(Boolean).join(', ')}
                readOnly
                disabled
              />
            ) : (
              <select
                id="claim-site-select"
                value={siteKey}
                onChange={(e) => {
                  const next = trial.sites.find((s) => s.key === e.target.value);
                  setSiteKey(e.target.value);
                  setSelectedPhoneOption(defaultPhone || next?.contactPhone?.trim() || savedPhones[0] || 'custom');
                  setCustomPhone('');
                }}
                className="claim-select"
                required
              >
                <option value="" disabled>
                  Select a location…
                </option>
                {trial.sites.map((s) => {
                  const other = claimedByOther(s);
                  return (
                    <option key={s.key} value={s.key} disabled={Boolean(other)}>
                      📍 {siteLabel(s)}
                      {other ? ` — already claimed by ${other.claimedByName}` : ''}
                    </option>
                  );
                })}
              </select>
            )}
          </div>

          {/* Hospital — always the one the PI/coordinator is registered with */}
          <div className="form-group">
            <label htmlFor="claim-hospital">
              Your Hospital <span className="req">*</span>
            </label>
            <span className="field-hint">Filled in from your registered provider profile.</span>
            <input id="claim-hospital" className="claim-input" value={hospitalName || 'Hospital not set on your profile'} readOnly disabled />
          </div>

          {/* Checkbox confirmation — the claimant's; a teammate edit doesn't re-confirm it */}
          {!isTeammateEdit && <div className="claim-confirm-card">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                required
              />
              <span>
                <b>I confirm that I am the Principal Investigator</b> (or authorized clinical study coordinator)
                for this clinical trial at <b>{site ? siteLabel(site) : existingClaim?.facility ?? 'the selected location'}</b>.
              </span>
            </label>
          </div>}

          {/* Contact Phone Number: Dropdown + Custom */}
          <div className="form-group">
            <label htmlFor="claim-phone-select">
              Center Contact Phone Number <span className="req">*</span>
            </label>
            <span className="field-hint">
              Select an existing contact phone for your site or enter a new direct line for patient and oncologist inquiries.
            </span>
            {phoneLocked ? (
              <input className="claim-input" value="Kept personal by the claimant — not shown publicly" readOnly disabled />
            ) : (<>
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
                  📞 {ph}{' '}
                  {ph === defaultPhone
                    ? '(Your public number)'
                    : site?.contactPhone === ph
                      ? '(Registry default)'
                      : '(Saved number)'}
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
            </>)}
            {!isTeammateEdit && <VisibilityToggle value={phoneVisibility} onChange={setPhoneVisibility} label="Phone" />}
            <span className="field-hint" style={{ marginTop: 4 }}>
              {phoneVisibility === 'public'
                ? 'Shown to patients and doctors on the public Trial Finder.'
                : isTeammateEdit
                  ? 'Only the claimant can change a personal number.'
                  : 'Personal — saved for you only. The public listing keeps showing the registry contact.'}
            </span>
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
                value={emailLocked ? '' : contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder={emailLocked ? 'Kept personal by the claimant' : 'pi@hospital.org'}
                className="claim-input"
                disabled={emailLocked}
                required={!emailLocked}
              />
              {!isTeammateEdit && <VisibilityToggle value={emailVisibility} onChange={setEmailVisibility} label="Email" />}
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
            {existingClaim && !isTeammateEdit && (
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
