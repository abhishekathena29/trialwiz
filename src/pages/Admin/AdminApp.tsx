import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, db, firebaseConfigured } from '../../firebase';
import './Admin.css';
import { AdminDashboard } from './AdminDashboard';
import { AdminHeader } from './AdminHeader';
import { AdminLogin } from './AdminLogin';

type AuthState = 'checking' | 'signed-out' | 'not-admin' | 'admin';

function SetupNotice() {
  return (
    <div className="tw-admin">
      <AdminHeader />
      <div className="login-wrap">
        <div className="setup-note">
          <b>Firebase isn't configured yet.</b> This dashboard reads from Firestore and requires Firebase Auth, so it
          can't run until you connect a Firebase project.
          <ol>
            <li>
              Create a project at{' '}
              <a href="https://console.firebase.google.com" target="_blank" rel="noopener">
                console.firebase.google.com
              </a>
              , then add a Web App to it.
            </li>
            <li>
              Enable <b>Firestore Database</b> and <b>Authentication → Email/Password</b>.
            </li>
            <li>
              Copy the web app config into <code>.env.local</code> (see <code>.env.example</code>).
            </li>
            <li>
              Deploy the security rules in <code>firestore.rules</code>.
            </li>
            <li>
              Create your own sign-in user in the Auth console, then add a document to the <code>admins</code>{' '}
              collection with that user's UID as the document ID (any field, e.g. <code>{'{ ok: true }'}</code>).
            </li>
          </ol>
          Full steps are in <code>README.md</code>.
        </div>
      </div>
    </div>
  );
}

export function AdminApp() {
  const [state, setState] = useState<AuthState>('checking');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!auth || !db) return;
    const firestore = db;
    return onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setState('signed-out');
        return;
      }
      const adminDoc = await getDoc(doc(firestore, 'admins', u.uid));
      if (adminDoc.exists()) {
        setUser(u);
        setState('admin');
      } else {
        setUser(u);
        setState('not-admin');
      }
    });
  }, []);

  if (!firebaseConfigured) return <SetupNotice />;
  if (state === 'checking') {
    return (
      <div className="tw-admin">
        <AdminHeader />
        <div className="login-wrap">
          <div className="login-card centered">Checking session…</div>
        </div>
      </div>
    );
  }
  if (state === 'signed-out') return <AdminLogin />;
  if (state === 'not-admin') {
    return (
      <div className="tw-admin">
        <AdminHeader />
        <div className="login-wrap">
          <div className="login-card">
            <h1>Not authorised</h1>
            <p>
              Signed in as <b>{user?.email}</b>, but this account isn't on the admin allowlist. Add its UID to the
              Firestore <code>admins</code> collection to grant access.
            </p>
            <button className="go" onClick={() => auth && signOut(auth)}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }
  return <AdminDashboard user={user as User} />;
}
