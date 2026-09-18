import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { auth, firebaseConfigured } from '../../firebase';
import { createCoordinatorProfile, createDoctorProfile } from '../../services/profiles';
import type { UserRole } from '../../types';
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
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

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
        facility.trim() &&
        (role === 'doctor' || (city.trim() && doctorEmail.trim()))));

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
          await createCoordinatorProfile(
            cred.user.uid,
            email.trim(),
            name.trim(),
            doctorEmail.trim(),
            facility.trim(),
            city.trim(),
            state.trim(),
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
        {/* Top Briefing Banner */}
        <div className="portal-brief-card">
          <div className="portal-brief-tag">
            <span>🩺 Principal Investigator & Clinical Research Portal</span>
          </div>
          <h2>Welcome to the TrialWiz Provider Portal</h2>
          <p className="portal-brief-lead">
            This portal is built for <b>Principal Investigators (PIs / Oncologists)</b> and their hospital{' '}
            <b>Clinical Trial Teams</b> to connect recruiting studies with referring doctors and matching patients.
          </p>

          <div className="portal-steps-grid">
            <div className="portal-step-item">
              <div className="step-num">1</div>
              <div className="step-desc">
                <b>Register with Hospital Name</b>
                <span>Sign up with your medical affiliation and trial center name.</span>
              </div>
            </div>
            <div className="portal-step-item">
              <div className="step-num">2</div>
              <div className="step-desc">
                <b>Admin Verification</b>
                <span>Admin verifies PI credentials to maintain research site integrity.</span>
              </div>
            </div>
            <div className="portal-step-item">
              <div className="step-num">3</div>
              <div className="step-desc">
                <b>Hospital-Filtered Trials</b>
                <span>Access live clinical trials pre-filtered for your hospital center.</span>
              </div>
            </div>
            <div className="portal-step-item">
              <div className="step-num">4</div>
              <div className="step-desc">
                <b>Claim Trials & Direct Contacts</b>
                <span>Claim your trials and publish direct site phone numbers for inquiries.</span>
              </div>
            </div>
          </div>
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
                <label htmlFor="pfacility">Hospital / Institution name</label>
                <input
                  id="pfacility"
                  value={facility}
                  onChange={(e) => setFacility(e.target.value)}
                  placeholder="e.g. Tata Memorial Centre, Apollo Cancer Centre, AIIMS"
                  required
                />
                <label htmlFor="pcity">City {role === 'doctor' && '(recommended)'}</label>
                <input
                  id="pcity"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Mumbai, Chennai, New Delhi"
                  required={role === 'coordinator'}
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
                {role === 'coordinator' && (
                  <>
                    <label htmlFor="pdocemail">Approving doctor's email</label>
                    <input
                      id="pdocemail"
                      type="email"
                      value={doctorEmail}
                      onChange={(e) => setDoctorEmail(e.target.value)}
                      placeholder="doctor@hospital.org"
                      required
                    />
                  </>
                )}
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
