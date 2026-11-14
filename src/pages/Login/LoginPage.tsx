import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { logUsage } from '../../analytics/usageLog';
import { SpecializationOptions } from '../../components/SpecializationOptions';
import { auth, db, firebaseConfigured } from '../../firebase';
import { useAuthUser } from '../../hooks/useAuthUser';
import {
  USERS_COLLECTION,
  createCoordinatorProfile,
  createDoctorProfile,
  findDoctorByEmail,
  recordSignIn,
  saveUserPhones,
} from '../../services/profiles';
import type { UserProfile } from '../../types';
import { friendlyAuthError } from '../../utils/authErrors';
import '../Admin/Admin.css';
import '../Portal/Portal.css';
import { PortalHeader } from '../Portal/PortalHeader';

/** The four account types offered on the one login page. Individuals and referring doctors get
 * a public Trial Finder account (role 'user'); PIs and coordinators get a provider account. */
export type LoginRole = 'individual' | 'doctor' | 'pi' | 'coordinator';

const ROLES: Array<{ key: LoginRole; label: string; hint: string }> = [
  { key: 'individual', label: 'Individual', hint: 'Patient, family member or caregiver — save trials to review later.' },
  { key: 'doctor', label: 'Doctor', hint: 'Referring doctor — search and save trials for your patients.' },
  {
    key: 'pi',
    label: 'Principal Investigator',
    hint: 'Claim trials at your hospital, publish contacts, close trials and approve your coordinators. Verified by TrialWiz admin.',
  },
  {
    key: 'coordinator',
    label: 'Trial Coordinator',
    hint: "Works under a Principal Investigator — your PI approves your account before you can manage trials.",
  },
];

function isLoginRole(v: string | null): v is LoginRole {
  return v === 'individual' || v === 'doctor' || v === 'pi' || v === 'coordinator';
}

/** Where a signed-in account belongs, decided by what it actually is — not by the role picked
 * on the form, so picking the "wrong" tile at sign-in still lands people in the right place. */
async function destinationFor(user: User): Promise<string> {
  if (!db) return '/';
  try {
    if ((await getDoc(doc(db, 'admins', user.uid))).exists()) return '/admin';
  } catch {
    // Not readable / not an admin — fall through.
  }
  try {
    const snap = await getDoc(doc(db, USERS_COLLECTION, user.uid));
    const role = snap.exists() ? (snap.data() as UserProfile).role : undefined;
    if (role === 'doctor' || role === 'coordinator') return '/portal';
    if (role === 'admin') return '/admin';
  } catch {
    // fall through
  }
  return '/';
}

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, loading: authLoading } = useAuthUser();

  const initialRole = params.get('role');
  const [role, setRole] = useState<LoginRole>(isLoginRole(initialRole) ? initialRole : 'individual');
  const [mode, setMode] = useState<'signin' | 'signup'>(params.get('mode') === 'signup' ? 'signup' : 'signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState(''); // private phone (every role)
  const [publicPhone, setPublicPhone] = useState(''); // PIs and doctors only
  const [specialization, setSpecialization] = useState(''); // PIs and doctors only
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [facility, setFacility] = useState('');
  const [city, setCity] = useState('');
  const [state, setStateField] = useState('');
  const [doctorEmail, setDoctorEmail] = useState('');
  const [matchedDoctor, setMatchedDoctor] = useState<UserProfile | null>(null);
  const [searchingDoctor, setSearchingDoctor] = useState(false);
  const [doctorSearchAttempted, setDoctorSearchAttempted] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const isProvider = role === 'pi' || role === 'coordinator';
  const twoPhones = role === 'pi' || role === 'doctor';

  // Coordinator sign-up: look up the named PI and pre-fill their hospital.
  useEffect(() => {
    const clean = doctorEmail.trim().toLowerCase();
    if (role !== 'coordinator' || mode !== 'signup' || !clean.includes('@') || !clean.includes('.')) {
      void Promise.resolve().then(() => {
        setMatchedDoctor(null);
        setDoctorSearchAttempted(false);
        setSearchingDoctor(false);
      });
      return;
    }
    let cancelled = false;
    void Promise.resolve().then(() => !cancelled && setSearchingDoctor(true));
    const timer = setTimeout(async () => {
      try {
        const found = await findDoctorByEmail(clean);
        if (cancelled) return;
        setMatchedDoctor(found && found.status === 'approved' ? found : null);
        setDoctorSearchAttempted(true);
        if (found) {
          setFacility(found.facility || '');
          setCity(found.city || '');
          setStateField(found.state || '');
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
        <PortalHeader title="TrialWiz · Log in" subtitle="One login for individuals, doctors, Principal Investigators and trial coordinators" />
        <div className="login-wrap">
          <div className="setup-note">
            <b>Firebase isn't configured yet.</b> Sign-in needs Firebase Auth + Firestore — see <code>README.md</code>.
            You can still search and browse trials without an account.
          </div>
        </div>
      </div>
    );
  }

  // Already signed in (and not mid-submit): offer to continue rather than show the form.
  if (!authLoading && user && !busy) {
    return (
      <div className="tw-admin">
        <PortalHeader title="TrialWiz · Log in" subtitle="One login for individuals, doctors, Principal Investigators and trial coordinators" />
        <div className="login-wrap">
          <div className="login-card">
            <h1>You're signed in</h1>
            <p>
              Signed in as <b>{user.email}</b>.
            </p>
            <button className="go" onClick={async () => navigate(await destinationFor(user), { replace: true })}>
              Continue
            </button>
            <p className="login-foot">
              <button className="linkbtn" type="button" onClick={() => auth && signOut(auth)}>
                Not you? Sign out
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  const passwordsMismatch = mode === 'signup' && confirmPassword.length > 0 && password !== confirmPassword;
  const signupFieldsOk =
    role === 'individual' || role === 'doctor'
      ? true
      : name.trim().length > 0 &&
        (role === 'pi' ? facility.trim().length > 0 : doctorEmail.trim().length > 0 && matchedDoctor !== null);
  const canSubmit =
    !busy &&
    email.trim().length > 0 &&
    password.length >= 6 &&
    (mode === 'signin' || (!passwordsMismatch && confirmPassword.length > 0 && signupFieldsOk));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!auth || !canSubmit) return;
    setBusy(true);
    setErr('');
    try {
      let signedIn: User;
      if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        signedIn = cred.user;
        const phones = twoPhones ? { phone, publicPhone } : { phone };
        if (role === 'pi') {
          await createDoctorProfile(signedIn.uid, email.trim(), name.trim(), facility, city, state, phones, specialization);
        } else if (role === 'coordinator' && matchedDoctor) {
          await createCoordinatorProfile(
            signedIn.uid,
            email.trim(),
            name.trim(),
            matchedDoctor.email,
            matchedDoctor.facility || facility.trim(),
            matchedDoctor.city || city.trim(),
            matchedDoctor.state || state.trim(),
            matchedDoctor.name,
            phones,
          );
        } else {
          await recordSignIn(
            signedIn,
            'user',
            role === 'doctor' ? 'doctor' : 'individual',
            name,
            role === 'doctor' ? specialization : undefined,
          );
          await saveUserPhones(signedIn.uid, phones);
        }
        logUsage('signup', 'email', role);
      } else {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        signedIn = cred.user;
        const dest = await destinationFor(signedIn);
        // Backfills a basic profile only for public accounts that predate profile records.
        await recordSignIn(signedIn, dest === '/' ? 'user' : dest === '/admin' ? 'admin' : undefined);
        logUsage('signin', 'email');
        navigate(dest, { replace: true });
        return;
      }
      navigate(await destinationFor(signedIn), { replace: true });
    } catch (e) {
      console.error('[TrialWiz] login error:', e);
      setErr(e instanceof Error ? friendlyAuthError(e.message) : 'Something went wrong — please try again.');
    } finally {
      setBusy(false);
    }
  }

  const roleInfo = ROLES.find((r) => r.key === role)!;
  const isSignup = mode === 'signup';

  return (
    <div className="tw-admin">
      <PortalHeader title="TrialWiz · Log in" subtitle="One login for individuals, doctors, Principal Investigators and trial coordinators" />
      <div className="login-wrap portal-auth-wrap">
        <div className="login-card">
          <h1>{isSignup ? 'Create an account' : 'Log in to TrialWiz'}</h1>
          <p>
            {isSignup
              ? 'Choose who you are — this sets up the right kind of account.'
              : "One login for everyone — you'll land on the right page for your account."}
          </p>

          {isSignup && (
            <>
              <label>I am a</label>
              <div className="roletoggle four" role="radiogroup" aria-label="Account type">
                {ROLES.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    role="radio"
                    aria-checked={role === r.key}
                    className={role === r.key ? 'on' : ''}
                    onClick={() => {
                      setRole(r.key);
                      setErr('');
                    }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="role-hint">{roleInfo.hint}</div>
            </>
          )}

          {err && <div className="login-err">{err}</div>}

          <form onSubmit={submit}>
            {isSignup && (
              <>
                <label htmlFor="lname">Full name{isProvider ? '' : ' (optional)'}</label>
                <input
                  id="lname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={twoPhones ? 'Dr. Firstname Lastname' : 'Firstname Lastname'}
                  required={isProvider}
                />
              </>
            )}

            {mode === 'signup' && role === 'pi' && (
              <>
                <label htmlFor="lfacility">Hospital / Institution name</label>
                <input
                  id="lfacility"
                  value={facility}
                  onChange={(e) => setFacility(e.target.value)}
                  placeholder="e.g. AIIMS New Delhi, Tata Memorial Centre"
                  required
                />
                <div className="form-row-2">
                  <div>
                    <label htmlFor="lcity">City</label>
                    <input id="lcity" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. New Delhi" />
                  </div>
                  <div>
                    <label htmlFor="lstate">State</label>
                    <input id="lstate" value={state} onChange={(e) => setStateField(e.target.value)} placeholder="e.g. Delhi" />
                  </div>
                </div>
              </>
            )}

            {mode === 'signup' && role === 'coordinator' && (
              <>
                <label htmlFor="ldocemail">Your Principal Investigator's email</label>
                <span className="field-hint">Your PI must already have a verified TrialWiz account — they approve you.</span>
                <input
                  id="ldocemail"
                  type="email"
                  value={doctorEmail}
                  onChange={(e) => setDoctorEmail(e.target.value)}
                  placeholder="pi@hospital.org"
                  required
                />
                {searchingDoctor && <div className="sup lookup-note">Looking up Principal Investigator…</div>}
                {matchedDoctor && (
                  <div className="pi-match">
                    <b>✓ {matchedDoctor.name}</b>
                    <span>
                      {matchedDoctor.facility || 'Hospital on record'}
                      {matchedDoctor.city && ` · ${matchedDoctor.city}`}
                    </span>
                  </div>
                )}
                {!searchingDoctor && doctorSearchAttempted && !matchedDoctor && (
                  <div className="login-err">
                    No verified Principal Investigator found with <b>{doctorEmail}</b>. Ask your PI to sign in first (or
                    contact TrialWiz admin).
                  </div>
                )}
              </>
            )}

            {isSignup && twoPhones && (
              <>
                <label htmlFor="lspec">Specialization</label>
                <input
                  id="lspec"
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                  placeholder="e.g. Medical Oncology"
                  list="specialization-options"
                />
                <SpecializationOptions />
              </>
            )}

            {isSignup && twoPhones && (
              <>
                <label htmlFor="lpubphone">Public phone</label>
                <input
                  id="lpubphone"
                  type="tel"
                  value={publicPhone}
                  onChange={(e) => setPublicPhone(e.target.value)}
                  placeholder="e.g. clinic / trial unit number"
                />
                <span className="field-hint">
                  {role === 'pi'
                    ? 'Shown to patients and doctors as the contact number on the trials you claim.'
                    : 'A number you are happy to share publicly.'}
                </span>
              </>
            )}

            {isSignup && (
              <>
                <label htmlFor="lphone">{twoPhones ? 'Private phone' : 'Phone number'}</label>
                <input
                  id="lphone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  autoComplete="tel"
                />
                <span className="field-hint">Visible only to you and TrialWiz admin — never shown publicly.</span>
              </>
            )}

            <label htmlFor="lemail">Email</label>
            <input
              id="lemail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
            <label htmlFor="lpass">Password</label>
            <div className="passwrap">
              <input
                id="lpass"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
              />
              <button
                type="button"
                className="pwtoggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {mode === 'signup' && (
              <>
                <label htmlFor="lpass2">Confirm password</label>
                <input
                  id="lpass2"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                {passwordsMismatch && <div className="login-err">Passwords don't match yet.</div>}
              </>
            )}
            <button className="go" type="submit" disabled={!canSubmit}>
              {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}
            </button>
          </form>

          <p className="login-foot">
            <button
              className="linkbtn"
              type="button"
              onClick={() => {
                setMode(mode === 'signup' ? 'signin' : 'signup');
                setErr('');
                setConfirmPassword('');
              }}
            >
              {mode === 'signup' ? 'Already have an account? Log in' : 'New here? Create an account'}
            </button>
          </p>
          {role === 'pi' && mode === 'signup' && (
            <p className="login-foot">
              Self-registered Principal Investigator accounts are verified by TrialWiz admin before you can claim
              trials. If admin already created your account, just sign in.
            </p>
          )}
        </div>
        <Link className="login-back" to="/">
          ‹ Back to the public Trial Finder
        </Link>
      </div>
    </div>
  );
}
