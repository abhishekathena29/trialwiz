import { useState } from 'react';
import type { SiteFields } from '../../services/addedSites';
import { HospitalInput } from '../../components/HospitalInput';
import './Portal.css';

interface Props {
  /** Badge + heading, e.g. "Add a location" / "Edit location". */
  badge: string;
  title: string;
  subtitle?: string;
  initial: SiteFields;
  submitLabel: string;
  /** Extra explanation shown above the buttons. */
  note?: React.ReactNode;
  onSubmit: (fields: SiteFields) => Promise<void>;
  onClose: () => void;
}

/** One form for a trial location's name, address and contact — used to add a location to a
 * trial, edit an added location, and edit a submitted trial's location/contact. */
export function SiteFormModal({ badge, title, subtitle, initial, submitLabel, note, onSubmit, onClose }: Props) {
  const [f, setF] = useState<SiteFields>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof SiteFields) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const canSave = !busy && f.facility.trim().length > 0 && f.city.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setErr('');
    try {
      await onSubmit(f);
      onClose();
    } catch (e) {
      console.error('[TrialWiz] site form error:', e);
      setErr(
        e instanceof Error && /permission/i.test(e.message)
          ? 'Not permitted — only the person who added this, their Principal Investigator’s team, or TrialWiz admin can change it.'
          : e instanceof Error
            ? e.message
            : 'Failed to save.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="claim-modal-overlay" onClick={onClose}>
      <div className="claim-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="claim-modal-head">
          <div>
            <span className="claim-badge-role">{badge}</span>
            <h2>{title}</h2>
            {subtitle && <p className="claim-sub">{subtitle}</p>}
          </div>
          <button className="claim-close-btn" onClick={onClose} type="button" aria-label="Close">
            ✕
          </button>
        </div>

        {err && <div className="login-err" style={{ margin: '12px 0' }}>{err}</div>}

        <form onSubmit={submit} className="claim-form">
          <span className="req-legend">
            Fields marked <span className="req">*</span> are required.
          </span>
          <div className="form-group">
            <label htmlFor="site-facility">
              Hospital / site name <span className="req">*</span>
            </label>
            <HospitalInput
              id="site-facility"
              className="claim-input"
              value={f.facility}
              onChange={(v) => setF((cur) => ({ ...cur, facility: v }))}
              onPick={(h) => setF((cur) => ({ ...cur, city: h.city || cur.city, state: h.state || cur.state }))}
              required
            />
          </div>
          <div className="form-row">
            <div className="form-group half">
              <label htmlFor="site-city">
                City <span className="req">*</span>
              </label>
              <input id="site-city" className="claim-input" value={f.city} onChange={set('city')} required />
            </div>
            <div className="form-group half">
              <label htmlFor="site-state">State</label>
              <input id="site-state" className="claim-input" value={f.state ?? ''} onChange={set('state')} />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="site-cname">Contact name</label>
            <input id="site-cname" className="claim-input" value={f.contactName ?? ''} onChange={set('contactName')} placeholder="e.g. Dr. A. Sharma" />
          </div>
          <div className="form-row">
            <div className="form-group half">
              <label htmlFor="site-cphone">Contact phone</label>
              <input id="site-cphone" type="tel" className="claim-input" value={f.contactPhone ?? ''} onChange={set('contactPhone')} />
            </div>
            <div className="form-group half">
              <label htmlFor="site-cemail">Contact email</label>
              <input id="site-cemail" type="email" className="claim-input" value={f.contactEmail ?? ''} onChange={set('contactEmail')} />
            </div>
          </div>
          <span className="field-hint">These details are shown publicly on the Trial Finder for this location.</span>

          {note && <div className="note" style={{ marginTop: 12 }}>{note}</div>}

          <div className="claim-actions" style={{ marginTop: 18 }}>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
              <button type="button" className="btn" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={!canSave}>
                {busy ? 'Saving…' : submitLabel}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
