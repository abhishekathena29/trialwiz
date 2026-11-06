import { signOut } from 'firebase/auth';
import { Navigate } from 'react-router-dom';
import { auth, firebaseConfigured } from '../../firebase';
import { useAuthUser } from '../../hooks/useAuthUser';
import { useUserProfile } from '../../hooks/useUserProfile';
import { CoordinatorPending } from './CoordinatorPending';
import { DoctorPending } from './DoctorPending';
import { DoctorDashboard } from './DoctorDashboard';
import './Portal.css';
import { PortalHeader } from './PortalHeader';

function SetupNotice() {
  return (
    <div className="tw-admin">
      <PortalHeader />
      <div className="login-wrap">
        <div className="setup-note">
          <b>Firebase isn't configured yet.</b> The provider portal needs Firebase Auth + Firestore — see{' '}
          <code>README.md</code>.
        </div>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="tw-admin">
      <PortalHeader />
      <div className="login-wrap">
        <div className="login-card centered">Checking session…</div>
      </div>
    </div>
  );
}

function NotRegistered({ email }: { email: string | null | undefined }) {
  return (
    <div className="tw-admin">
      <PortalHeader
        right={
          <span className="lockpill" onClick={() => auth && signOut(auth)}>
            {email} · sign out
          </span>
        }
      />
      <div className="login-wrap">
        <div className="login-card">
          <h1>Not a provider account</h1>
          <p>
            Signed in as <b>{email}</b>, but this account isn't registered as a Principal Investigator or trial
            coordinator. Sign out and create a provider account to use this portal.
          </p>
          <button className="go" onClick={() => auth && signOut(auth)}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export function PortalApp() {
  const { user, loading: authLoading } = useAuthUser();
  const { profile, loading: profileLoading } = useUserProfile(user);

  if (!firebaseConfigured) return <SetupNotice />;
  if (authLoading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (profileLoading) return <Loading />;
  // Public Trial Finder and admin accounts also have a users/ profile, but aren't providers.
  if (!profile || profile.role === 'user' || profile.role === 'admin') return <NotRegistered email={user.email} />;

  if (profile.role === 'doctor') {
    if (profile.status !== 'approved') {
      return <DoctorPending user={user} profile={profile} />;
    }
    return <DoctorDashboard user={user} profile={profile} />;
  }

  // coordinator
  if (profile.status !== 'approved') return <CoordinatorPending user={user} profile={profile} />;

  return <DoctorDashboard user={user} profile={profile} />;
}
