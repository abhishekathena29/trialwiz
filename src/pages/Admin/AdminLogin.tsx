import { signInWithEmailAndPassword } from 'firebase/auth';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '../../firebase';
import { AdminHeader } from './AdminHeader';

export function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!auth) return;
    setBusy(true);
    setErr('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch {
      setErr('Sign-in failed — check the email and password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tw-admin">
      <AdminHeader />
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-icon">
            <svg viewBox="0 0 24 24" fill="none">
              <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </div>
          <h1>Owner sign-in</h1>
          <p>Sign in with an account that's been granted access to view aggregate demand data.</p>
          {err && <div className="login-err">{err}</div>}
          <form onSubmit={submit}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button className="go" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p className="login-foot">
            Not signed up for access? Contact the project owner — accounts are added manually, not self-served.
          </p>
        </div>
        <Link className="login-back" to="/">
          ‹ Back to the public Trial Finder
        </Link>
      </div>
    </div>
  );
}
