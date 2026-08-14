import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { useState } from 'react';
import { logUsage } from '../../analytics/usageLog';
import { auth, firebaseConfigured } from '../../firebase';

function friendlyAuthError(message: string): string {
  if (message.includes('auth/email-already-in-use')) return 'An account with this email already exists — try signing in instead.';
  if (message.includes('auth/invalid-credential') || message.includes('auth/wrong-password')) return 'Incorrect email or password.';
  if (message.includes('auth/user-not-found')) return 'No account found with this email — try creating one instead.';
  if (message.includes('auth/weak-password')) return 'Password should be at least 6 characters.';
  if (message.includes('auth/invalid-email')) return "That doesn't look like a valid email address.";
  if (message.includes('auth/too-many-requests')) return 'Too many attempts — wait a moment and try again.';
  return 'Something went wrong — please try again.';
}

export function AuthPanel() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!firebaseConfigured || !auth) {
    return (
      <div className="authcard">
        <p className="authsub">Accounts aren't set up for this deployment yet — you can still search and browse without signing in.</p>
      </div>
    );
  }

  async function submit() {
    if (!auth) return;
    setError('');
    setBusy(true);
    try {
      if (mode === 'signup') {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
        logUsage('signup', 'email');
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        logUsage('signin', 'email');
      }
    } catch (e) {
      setError(e instanceof Error ? friendlyAuthError(e.message) : 'Something went wrong — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="authcard">
      <h2>{mode === 'signup' ? 'Create a free account' : 'Sign in'}</h2>
      <p className="authsub">Optional — save trials to review later. No account is needed to search or browse.</p>
      {error && <div className="autherr">{error}</div>}
      <label className="lab" htmlFor="aemail">
        Email
      </label>
      <input id="aemail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <label className="lab" htmlFor="apass">
        Password
      </label>
      <input
        id="apass"
        type="password"
        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <button className="go" onClick={submit} disabled={busy || !email.trim() || password.length < 6}>
        {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
      </button>
      <button
        className="authswitch"
        onClick={() => {
          setMode(mode === 'signup' ? 'signin' : 'signup');
          setError('');
        }}
      >
        {mode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}
      </button>
    </div>
  );
}
