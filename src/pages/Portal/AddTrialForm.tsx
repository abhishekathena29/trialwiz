import type { User } from 'firebase/auth';
import { useState } from 'react';
import { CANCERS } from '../../data/cancerTaxonomy';
import { CITIES, matchCity } from '../../data/cities';
import { generateSubmittedTrialId, submitTrial } from '../../services/trialSubmissions';
import type { LineOfTherapy, UserProfile } from '../../types';
import './Portal.css';

const STATUS_OPTIONS = ['RECRUITING', 'NOT_YET_RECRUITING', 'ACTIVE_NOT_RECRUITING', 'ENROLLING_BY_INVITATION'];
const PHASE_OPTIONS = ['NA', 'PHASE1', 'PHASE2', 'PHASE3', 'PHASE4'];
const PHASE_LABELS: Record<string, string> = {
  NA: 'N/A',
  PHASE1: 'Phase 1',
  PHASE2: 'Phase 2',
  PHASE3: 'Phase 3',
  PHASE4: 'Phase 4',
};
const METASTATIC_OPTIONS: Array<{ value: 'mentioned' | 'early-stage' | 'unspecified'; label: string }> = [
  { value: 'unspecified', label: 'Unspecified' },
  { value: 'early-stage', label: 'Early-stage' },
  { value: 'mentioned', label: 'Advanced / metastatic' },
];
const LINE_OPTIONS: Array<{ value: LineOfTherapy; label: string }> = [
  { value: 'unspecified', label: 'Unspecified' },
  { value: 'neoadjuvant', label: 'Neoadjuvant' },
  { value: 'adjuvant', label: 'Adjuvant' },
  { value: 'first-line', label: '1st line' },
  { value: 'second-line', label: '2nd line' },
  { value: 'third-line-plus', label: '3rd line+' },
];

export function AddTrialForm({ user, profile, onSubmitted }: { user: User; profile: UserProfile; onSubmitted?: () => void }) {
  const [briefTitle, setBriefTitle] = useState('');
  const [cancerType, setCancerType] = useState(CANCERS[0]);
  const [conditions, setConditions] = useState('');
  const [overallStatus, setOverallStatus] = useState('RECRUITING');
  const [phases, setPhases] = useState<string[]>([]);
  const [facility, setFacility] = useState(profile.facility ?? '');
  const [city, setCity] = useState(profile.city ?? '');
  const [state, setState] = useState(profile.state ?? '');
  const [contactName, setContactName] = useState(profile.name ?? '');
  const [contactPhone, setContactPhone] = useState('');
  const [piPhone, setPiPhone] = useState('');
  const [contactEmail, setContactEmail] = useState(profile.email ?? '');
  const [eligibilityCriteria, setEligibilityCriteria] = useState('');
  const [briefSummary, setBriefSummary] = useState('');
  const [enrollmentCount, setEnrollmentCount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [metastatic, setMetastatic] = useState<'mentioned' | 'early-stage' | 'unspecified'>('unspecified');
  const [lineOfTherapy, setLineOfTherapy] = useState<LineOfTherapy>('unspecified');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  function togglePhase(p: string) {
    setPhases((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  const canSubmit = briefTitle.trim() && facility.trim() && city.trim() && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const resolvedDoctorUid = profile.doctorUid || (profile.role === 'doctor' ? user.uid : null);
    if (!canSubmit || !resolvedDoctorUid) return;
    setBusy(true);
    setErr('');
    try {
      const id = generateSubmittedTrialId();
      const matchedCity = matchCity(city.trim());
      const coords = CITIES[matchedCity];
      await submitTrial({
        key: `${id}__0`,
        nctId: id,
        briefTitle: briefTitle.trim(),
        conditions: conditions
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
        cancerType,
        overallStatus,
        phases,
        facility: facility.trim(),
        city: city.trim(),
        state: state.trim() || undefined,
        lat: coords?.[0],
        lon: coords?.[1],
        contactName: contactName.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        principalInvestigatorPhone: piPhone.trim() || undefined,
        lastUpdatePostDate: new Date().toISOString().slice(0, 10),
        metastatic,
        lineOfTherapy,
        eligibilityCriteria: eligibilityCriteria.trim() || undefined,
        briefSummary: briefSummary.trim() || undefined,
        studyType: 'INTERVENTIONAL',
        enrollmentCount: enrollmentCount ? Number(enrollmentCount) : undefined,
        startDate: startDate || undefined,
        submittedBy: user.uid,
        submittedByName: profile.name,
        doctorUid: resolvedDoctorUid,
      });
      setDone(true);
      setBriefTitle('');
      setConditions('');
      setEligibilityCriteria('');
      setBriefSummary('');
      setEnrollmentCount('');
      setStartDate('');
      setPhases([]);
      setContactPhone('');
      setPiPhone('');
      onSubmitted?.();
    } catch (e) {
      console.error('[TrialWiz] trial submission failed:', e);
      setErr(e instanceof Error ? e.message : 'Could not submit the trial — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card full">
      <h2>Add a clinical trial</h2>
      {done && <div className="note">Trial submitted — it's now live in the public Trial Finder.</div>}
      {err && <div className="login-err">{err}</div>}
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="span2">
            <label htmlFor="title">Trial title</label>
            <input id="title" value={briefTitle} onChange={(e) => setBriefTitle(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="cancerType">Cancer type</label>
            <select id="cancerType" value={cancerType} onChange={(e) => setCancerType(e.target.value)}>
              {CANCERS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="status">Recruitment status</label>
            <select id="status" value={overallStatus} onChange={(e) => setOverallStatus(e.target.value)}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          <div className="span2">
            <label htmlFor="conditions">Conditions (comma-separated)</label>
            <input id="conditions" value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="e.g. Non-small cell lung cancer, Stage IV" />
          </div>
          <div className="span2">
            <label>Phase(s)</label>
            <div className="roletoggle">
              {PHASE_OPTIONS.map((p) => (
                <button type="button" key={p} className={phases.includes(p) ? 'on' : ''} onClick={() => togglePhase(p)}>
                  {PHASE_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="facility">Facility / hospital</label>
            <input id="facility" value={facility} onChange={(e) => setFacility(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="city">City</label>
            <input id="city" value={city} onChange={(e) => setCity(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="state">State</label>
            <input id="state" value={state} onChange={(e) => setState(e.target.value)} />
          </div>
          <div>
            <label htmlFor="enrollment">Enrollment target</label>
            <input id="enrollment" type="number" min="0" value={enrollmentCount} onChange={(e) => setEnrollmentCount(e.target.value)} />
          </div>
          <div>
            <label htmlFor="contactName">Contact name</label>
            <input id="contactName" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="contactPhone">Coordinator / site phone</label>
            <input id="contactPhone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="e.g. 022-24177000" />
          </div>
          <div>
            <label htmlFor="piPhone">Principal Investigator phone</label>
            <input id="piPhone" type="tel" value={piPhone} onChange={(e) => setPiPhone(e.target.value)} placeholder="e.g. +91 98765 43210" />
          </div>
          <div className="span2">
            <label htmlFor="contactEmail">Contact email</label>
            <input id="contactEmail" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </div>
          <div>
            <label htmlFor="metastatic">Disease stage</label>
            <select id="metastatic" value={metastatic} onChange={(e) => setMetastatic(e.target.value as typeof metastatic)}>
              {METASTATIC_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="line">Line of therapy</label>
            <select id="line" value={lineOfTherapy} onChange={(e) => setLineOfTherapy(e.target.value as LineOfTherapy)}>
              {LINE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="startDate">Start date</label>
            <input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="span2">
            <label htmlFor="summary">Brief summary</label>
            <textarea id="summary" value={briefSummary} onChange={(e) => setBriefSummary(e.target.value)} />
          </div>
          <div className="span2">
            <label htmlFor="eligibility">Eligibility criteria</label>
            <textarea id="eligibility" value={eligibilityCriteria} onChange={(e) => setEligibilityCriteria(e.target.value)} />
          </div>
        </div>
        <div className="actions" style={{ marginTop: 16 }}>
          <button className="btn primary" type="submit" disabled={!canSubmit}>
            {busy ? 'Submitting…' : 'Submit trial'}
          </button>
        </div>
      </form>
    </div>
  );
}
