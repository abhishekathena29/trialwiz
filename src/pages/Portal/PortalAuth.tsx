import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { auth, firebaseConfigured } from '../../firebase';
import { createCoordinatorProfile, createDoctorProfile, findDoctorByEmail } from '../../services/profiles';
import type { UserProfile, UserRole } from '../../types';
import { friendlyAuthError } from '../../utils/authErrors';
import { PortalHeader } from './PortalHeader';
import './Portal.css';

export function PortalAuth() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [role, setRole] = useState<UserRole>('doctor');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [facility, setFacility] = useState('');
  const [city, setCity] = useState('');
  const [state, setStateField] = useState('');
  const [doctorEmail, setDoctorEmail] = useState('');
  const [matchedDoctor, setMatchedDoctor] = useState<UserProfile | null>(null);
  const [searchingDoctor, setSearchingDoctor] = useState(false);
  const [doctorSearchAttempted, setDoctorSearchAttempted] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Auto-fetch doctor data whenever coordinator enters/changes doctorEmail
  useEffect(() => {
    if (role !== 'coordinator' || mode !== 'signup') {
      setMatchedDoctor(null);
      setDoctorSearchAttempted(false);
      return;
    }
    const clean = doctorEmail.trim().toLowerCase();
    if (!clean || !clean.includes('@') || !clean.includes('.')) {
      setMatchedDoctor(null);
      setDoctorSearchAttempted(false);
      return;
    }

    let cancelled = false;
    setSearchingDoctor(true);
    const timer = setTimeout(async () => {
      try {
        const found = await findDoctorByEmail(clean);
        if (!cancelled) {
          setMatchedDoctor(found);
          setDoctorSearchAttempted(true);
          if (found) {
            setFacility(found.facility || '');
            setCity(found.city || '');
            setStateField(found.state || '');
          }
        }
      } catch (e) {
        console.warn('[TrialWiz] Doctor lookup error:', e);
      } finally {
        if (!cancelled) setSearchingDoctor(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [doctorEmail, role, mode]);

  if (!firebaseConfigured || !auth) {
    return (
      <div className="tw-admin">
        <PortalHeader />
        <div className="login-wrap">
          <div className="setup-note">
            <b>Firebase isn't configured yet.</b> The provider portal needs Firebase Auth + Firestore — see
            <code> README.md</code>.
          </div>
        </div>
      </div>
    );
  }

  const passwordsMismatch = mode === 'signup' && confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit =
    !busy &&
    email.trim() &&
    password.length >= 6 &&
    (mode === 'signin' ||
      (name.trim() &&
        !passwordsMismatch &&
        (role === 'doctor'
          ? facility.trim().length > 0
          : doctorEmail.trim().length > 0 && (matchedDoctor !== null || facility.trim().length > 0))));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!auth || !canSubmit) return;
    setBusy(true);
    setErr('');
    try {
      if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (role === 'doctor') {
          await createDoctorProfile(
            cred.user.uid,
            email.trim(),
            name.trim(),
            facility.trim(),
            city.trim(),
            state.trim(),
          );
        } else {
          const resolvedFacility = matchedDoctor?.facility || facility.trim();
          const resolvedCity = matchedDoctor?.city || city.trim();
          const resolvedState = matchedDoctor?.state || state.trim();
          await createCoordinatorProfile(
            cred.user.uid,
            email.trim(),
            name.trim(),
            doctorEmail.trim(),
            resolvedFacility,
            resolvedCity,
            resolvedState,
            matchedDoctor?.name,
          );
        }
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (e) {
      console.error('[TrialWiz] portal auth error:', e);
      setErr(e instanceof Error ? friendlyAuthError(e.message) : 'Something went wrong — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tw-admin">
      <PortalHeader />
      <div className="login-wrap portal-auth-wrap">
        {/* Minimal Provider Briefing Banner */}
        <div className="portal-brief-compact">
          <div className="portal-brief-head">
            <span className="portal-brief-tag">🩺 Principal Investigator Portal</span>
            <span className="portal-brief-sub">For PIs, Oncologists & Clinical Trial Teams</span>
          </div>
          <ul className="portal-brief-pointers">
            <li>
              <b>Admin Verification:</b> Doctor accounts are verified by TrialWiz admin before full trial access.
            </li>
            <li>
              <b>Claim Trials & Contacts:</b> Claim active trials and add direct site phone numbers for patient referrals.
            </li>
          </ul>
        </div>

        <div className="login-card">
          <h1>{mode === 'signup' ? 'Create a provider account' : 'Sign in'}</h1>
          <p>
            {mode === 'signup'
              ? 'For Principal Investigators and trial coordinators. PI accounts are verified by TrialWiz admin before claiming trials.'
              : 'Sign in with your Principal Investigator or trial coordinator account.'}
          </p>
          {err && <div className="login-err">{err}</div>}
          <form onSubmit={submit}>
            {mode === 'signup' && (
              <>
                <label>I am a</label>
                <div className="roletoggle">
                  <button type="button" className={role === 'doctor' ? 'on' : ''} onClick={() => setRole('doctor')}>
                    Principal Investigator (Doctor)
                  </button>
                  <button type="button" className={role === 'coordinator' ? 'on' : ''} onClick={() => setRole('coordinator')}>
                    Trial coordinator
                  </button>
                </div>
                <label htmlFor="pname">Full name</label>
                <input
                  id="pname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={role === 'doctor' ? 'Dr. Firstname Lastname' : 'Firstname Lastname'}
                  required
                />
                {role === 'doctor' && (
                  <>
                    <label htmlFor="pfacility">Hospital / Institution name</label>
                    <input
                      id="pfacility"
                      value={facility}
                      onChange={(e) => setFacility(e.target.value)}
                      placeholder="e.g. Tata Memorial Centre, Apollo Cancer Centre, AIIMS"
                      required
                    />
                    <label htmlFor="pcity">City (recommended)</label>
                    <input
                      id="pcity"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g. Mumbai, Chennai, New Delhi"
                    />
                    <label htmlFor="pstate">State (optional)</label>
                    <input
                      id="pstate"
                      value={state}
                      onChange={(e) => setStateField(e.target.value)}
                      placeholder="e.g. Maharashtra, Tamil Nadu"
                    />
                  </>
                )}
                {role === 'coordinator' && (
                  <>
                    <label htmlFor="pdocemail">Approving Doctor / Principal Investigator's Email</label>
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: 5 }}>
                      Enter your Principal Investigator's email — their hospital data will be fetched automatically.
                    </span>
                    <input
                      id="pdocemail"
                      type="email"
                      value={doctorEmail}
                      onChange={(e) => setDoctorEmail(e.target.value)}
                      placeholder="doctor@hospital.org"
                      required
                    />
                    {searchingDoctor && (
                      <div className="sup" style={{ margin: '4px 0 8px', color: 'var(--brand-d)' }}>
                        🔍 Fetching doctor & hospital information…
                      </div>
                    )}
                    {matchedDoctor && (
                      <div
                        style={{
                          background: '#f0faf3',
                          border: '1.5px solid #bcecd0',
                          borderRadius: '11px',
                          padding: '12px 14px',
                          margin: '6px 0 12px',
                        }}
                      >
                        <div style={{ color: '#16794b', fontWeight: 700, fontSize: '12.5px' }}>
                          ✓ Principal Investigator Matched
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 650, color: 'var(--ink)', marginTop: 3 }}>
                          Dr. {matchedDoctor.name}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--ink2)', marginTop: 2 }}>
                          🏥 <b>Hospital:</b> {matchedDoctor.facility || 'Hospital on record'}
                          {matchedDoctor.city && <span> · {matchedDoctor.city}</span>}
                          {matchedDoctor.state && <span>, {matchedDoctor.state}</span>}
                        </div>
                        <div style={{ fontSize: '11px', color: '#16794b', marginTop: 4 }}>
                          Your coordinator account will be affiliated with this center automatically.
                        </div>
                      </div>
                    )}
                    {!searchingDoctor && doctorSearchAttempted && !matchedDoctor && (
                      <div className="login-err" style={{ margin: '6px 0 12px', fontSize: '12px' }}>
                        No registered doctor found with email <b>{doctorEmail}</b>. Please ask your Principal Investigator to create their account first.
                      </div>
                    )}
                  </>
                )}
              </>
            )}
            <label htmlFor="pemail">Email</label>
            <input
              id="pemail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
            <label htmlFor="ppass">Password</label>
            <input
              id="ppass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
            />
            {mode === 'signup' && (
              <>
                <label htmlFor="ppass2">Confirm password</label>
                <input
                  id="ppass2"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                {passwordsMismatch && <div className="login-err">Passwords don't match yet.</div>}
              </>
            )}
            <button className="go" type="submit" disabled={!canSubmit}>
              {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          </form>
          <p className="login-foot">
            <button
              className="authswitch"
              type="button"
              onClick={() => {
                setMode(mode === 'signup' ? 'signin' : 'signup');
                setErr('');
              }}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', textDecoration: 'underline' }}
            >
              {mode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create a doctor or coordinator account'}
            </button>
          </p>
        </div>
        <Link className="login-back" to="/">
          ‹ Back to the public Trial Finder
        </Link>
      </div>
    </div>
  );
}
