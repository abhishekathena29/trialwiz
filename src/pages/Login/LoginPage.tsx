import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { logUsage } from '../../analytics/usageLog';
import { deletedAccountState } from '../../services/accountDeletion';
import { SpecializationOptions } from '../../components/SpecializationOptions';
import { auth, db, firebaseConfigured } from '../../firebase';
import { useAuthUser } from '../../hooks/useAuthUser';
import {
  USERS_COLLECTION,
  createCoordinatorProfile,
  createDoctorProfile,
  createPublicProfile,
  findDoctorByEmail,
  recordSignIn,
  saveUserPhones,
} from '../../services/profiles';
import type { UserCredential } from 'firebase/auth';
import type { UserProfile } from '../../types';
import { friendlyAuthError } from '../../utils/authErrors';
import '../Admin/Admin.css';
import '../Portal/Portal.css';
import { HospitalInput } from '../../components/HospitalInput';
import { PortalHeader } from '../Portal/PortalHeader';

/** The account types offered on the one login page. Individuals and referring doctors get a
 * public Trial Finder account (role 'user'); PIs, coordinators and trial team doctors get a
 * provider account. */
export type LoginRole = 'individual' | 'doctor' | 'pi' | 'coordinator' | 'trialDoctor';

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
  {
    key: 'trialDoctor',
    label: 'Trial Team Doctor',
    hint: 'A doctor on a hospital trial team. Same features as a Principal Investigator — claim and close trials, publish contacts, approve coordinators. Verified by TrialWiz admin.',
  },
];

/**
 * May this existing login sign up again? Yes when it has no profile (an earlier sign-up that never
 * finished), when its account was rejected / revoked, or when admin deleted it and released the
 * email. No when it's a live account (they should log in) or a deleted one admin kept blocked.
 */
async function reRegistrationCheck(user: User): Promise<'ok' | 'active' | 'blocked'> {
  const deleted = await deletedAccountState(user.uid);
  if (deleted === 'blocked') return 'blocked';
  if (deleted === 'reusable' || !db) return 'ok';
  const snap = await getDoc(doc(db, USERS_COLLECTION, user.uid));
  if (!snap.exists()) return 'ok';
  return (snap.data() as UserProfile).status === 'rejected' ? 'ok' : 'active';
}

function isLoginRole(v: string | null): v is LoginRole {
  return v === 'individual' || v === 'doctor' || v === 'pi' || v === 'coordinator' || v === 'trialDoctor';
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
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [phone, setPhone] = useState(''); // private phone (every role)
  const [publicPhone, setPublicPhone] = useState(''); // PIs and doctors only
  const [specialization, setSpecialization] = useState(''); // PIs and doctors only
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetMsg, setResetMsg] = useState('');

  const [facility, setFacility] = useState('');
  const [city, setCity] = useState('');
  const [state, setStateField] = useState('');
  const [doctorEmail, setDoctorEmail] = useState('');
  const [matchedDoctor, setMatchedDoctor] = useState<UserProfile | null>(null);
  const [searchingDoctor, setSearchingDoctor] = useState(false);
  const [doctorSearchAttempted, setDoctorSearchAttempted] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function sendReset() {
    setErr('');
    setResetMsg('');
    if (!auth) return;
    if (!email.trim()) {
      setErr('Type your email above first, then tap "Forgot password".');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      // Firebase doesn't reveal whether the email has an account — so neither do we.
      setResetMsg(`If ${email.trim()} has a TrialWiz account, a password reset link is on its way. Check your inbox (and spam).`);
    } catch (e) {
      setErr(e instanceof Error ? friendlyAuthError(e.message) : 'Could not send the reset email.');
    }
  }

  /** Works under a PI, who approves them. */
  const isTeam = role === 'coordinator';
  /** PI or Trial Team Doctor — the same kind of account, only the label differs. */
  const isPiLike = role === 'pi' || role === 'trialDoctor';
  const isProvider = isPiLike || isTeam;
  const twoPhones = role === 'pi' || role === 'doctor' || role === 'trialDoctor';

  // Team-member sign-up: look up the named PI and pre-fill their hospital.
  useEffect(() => {
    const clean = doctorEmail.trim().toLowerCase();
    if (!isTeam || mode !== 'signup' || !clean.includes('@') || !clean.includes('.')) {
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
  }, [doctorEmail, isTeam, mode]);

  if (!firebaseConfigured || !auth) {
    return (
      <div className="tw-admin">
        <PortalHeader title="TrialWiz · Log in" subtitle="One login for individuals, doctors, Principal Investigators and trial teams" />
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
        <PortalHeader title="TrialWiz · Log in" subtitle="One login for individuals, doctors, Principal Investigators and trial teams" />
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
        (isPiLike ? facility.trim().length > 0 : doctorEmail.trim().length > 0 && matchedDoctor !== null);
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
        let cred: UserCredential;
        try {
          cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        } catch (createErr) {
          if ((createErr as { code?: string }).code !== 'auth/email-already-in-use') throw createErr;
          // This email already has a login. If its account was rejected / revoked (e.g. they signed
          // up under the wrong role), the same person may sign up again — the password proves it.
          try {
            cred = await signInWithEmailAndPassword(auth, email.trim(), password);
          } catch {
            setErr(
              'This email already has a TrialWiz account. Log in instead. If that account was not approved or was revoked, enter its password here to sign up again with the right role (forgot it? use “Forgot password” on the log-in screen).',
            );
            return;
          }
          const check = await reRegistrationCheck(cred.user);
          if (check !== 'ok') {
            await signOut(auth);
            setErr(
              check === 'active'
                ? 'This email already has an active TrialWiz account — log in instead. To change its account type, contact TrialWiz admin.'
                : 'This account was removed by TrialWiz admin. Contact admin if you need to use this email again.',
            );
            return;
          }
        }
        signedIn = cred.user;
        const phones = twoPhones ? { phone, publicPhone } : { phone };
        if (isPiLike) {
          await createDoctorProfile(
            signedIn.uid,
            email.trim(),
            name.trim(),
            facility,
            city,
            state,
            phones,
            specialization,
            role === 'trialDoctor' ? 'trialDoctor' : 'pi',
          );
        } else if (isTeam && matchedDoctor) {
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
          await createPublicProfile(
            signedIn,
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
        // Deleted by an admin, but the login lingers until purge-deleted-accounts runs — refuse it
        // here, before recordSignIn could recreate a public profile for it.
        const deleted = await deletedAccountState(signedIn.uid);
        if (deleted !== 'active') {
          await signOut(auth);
          setErr(
            deleted === 'reusable'
              ? 'This account was removed by TrialWiz admin, but you can use this email again: choose “New here? Create an account”, pick the right account type and use the same password.'
              : 'This account has been removed by TrialWiz admin. Contact admin if you think this is a mistake.',
          );
          return;
        }
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
      <PortalHeader title="TrialWiz · Log in" subtitle="One login for individuals, doctors, Principal Investigators and trial teams" />
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
              <span className="req-legend">
                Fields marked <span className="req">*</span> are required.
              </span>
            )}
            {isSignup && (
              <>
                <label htmlFor="lname">
                  Full name {isProvider ? <span className="req">*</span> : <span className="sup">(optional)</span>}
                </label>
                <input
                  id="lname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={twoPhones ? 'Dr. Firstname Lastname' : 'Firstname Lastname'}
                  required={isProvider}
                />
              </>
            )}

            {mode === 'signup' && isPiLike && (
              <>
                <label htmlFor="lfacility">
                  Hospital / Institution name <span className="req">*</span>
                </label>
                <HospitalInput
                  id="lfacility"
                  value={facility}
                  onChange={setFacility}
                  onPick={(h) => {
                    setCity(h.city);
                    setStateField(h.state);
                  }}
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

            {mode === 'signup' && isTeam && (
              <>
                <label htmlFor="ldocemail">
                  Your Principal Investigator's email <span className="req">*</span>
                </label>
                <span className="field-hint">
                  Your PI must already have a verified TrialWiz account — they approve you, and the approval is recorded.
                </span>
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
                  {role === 'pi' || role === 'trialDoctor'
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

            <label htmlFor="lemail">
              Email {isSignup && <span className="req">*</span>}
            </label>
            <input
              id="lemail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
            <label htmlFor="lpass">
              Password {isSignup && <><span className="req">*</span> <span className="sup">(at least 6 characters)</span></>}
            </label>
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
                <label htmlFor="lpass2">
                  Confirm password <span className="req">*</span>
                </label>
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
            {mode === 'signin' && (
              <button type="button" className="linkbtn forgotpw" onClick={sendReset} disabled={busy}>
                Forgot password? Email me a reset link
              </button>
            )}
            {resetMsg && <div className="login-ok">{resetMsg}</div>}
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
          {isPiLike && mode === 'signup' && (
            <p className="login-foot">
              Your account is saved straight away and verified by TrialWiz admin — or by a verified Principal
              Investigator at your own hospital — before you can claim trials. If admin already created your account,
              just sign in.
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
