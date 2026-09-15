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
      (name.trim() && !passwordsMismatch && (role === 'doctor' || (facility.trim() && city.trim() && doctorEmail.trim()))));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!auth || !canSubmit) return;
    setBusy(true);
    setErr('');
    try {
      if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (role === 'doctor') {
          await createDoctorProfile(cred.user.uid, email.trim(), name.trim());
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
      <div className="login-wrap">
        <div className="login-card">
          <h1>{mode === 'signup' ? 'Create a provider account' : 'Sign in'}</h1>
          <p>
            {mode === 'signup'
              ? 'For doctors and trial coordinators only. A coordinator account needs approval from the doctor named below before it can add trials.'
              : 'Sign in with your doctor or trial-coordinator account.'}
          </p>
          {err && <div className="login-err">{err}</div>}
          <form onSubmit={submit}>
            {mode === 'signup' && (
              <>
                <label>I am a</label>
                <div className="roletoggle">
                  <button type="button" className={role === 'doctor' ? 'on' : ''} onClick={() => setRole('doctor')}>
                    Doctor
                  </button>
                  <button type="button" className={role === 'coordinator' ? 'on' : ''} onClick={() => setRole('coordinator')}>
                    Trial coordinator
                  </button>
                </div>
                <label htmlFor="pname">Full name</label>
                <input id="pname" value={name} onChange={(e) => setName(e.target.value)} required />
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
                    <label htmlFor="pfacility">Your hospital / trial centre</label>
                    <input id="pfacility" value={facility} onChange={(e) => setFacility(e.target.value)} required />
                    <label htmlFor="pcity">City</label>
                    <input id="pcity" value={city} onChange={(e) => setCity(e.target.value)} required />
                    <label htmlFor="pstate">State (optional)</label>
                    <input id="pstate" value={state} onChange={(e) => setStateField(e.target.value)} />
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
              {mode === 'signup' ? 'Already have an account? Sign in' : "New here? Create a doctor or coordinator account"}
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
