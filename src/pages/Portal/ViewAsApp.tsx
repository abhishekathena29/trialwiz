import type { User } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../../firebase';
import { accountLabel, type UserProfile } from '../../types';
import { DoctorDashboard } from './DoctorDashboard';
import { PortalHeader } from './PortalHeader';
import './Portal.css';

function ExitLink() {
  return (
    <Link className="lockpill" to="/admin" style={{ textDecoration: 'none' }}>
      ← Back to admin
    </Link>
  );
}

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="tw-admin">
      <PortalHeader right={<ExitLink />} />
      <div className="login-wrap">
        <div className="login-card">
          <h1>{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Admin "View as": shows the portal exactly as one account sees it — same profile, same claims,
 * same team — with every action blocked (DoctorDashboard `readOnly`). Only for signed-in admins;
 * anyone else gets "Not authorised" (and firestore.rules wouldn't let them read the data anyway).
 */
export function ViewAsApp({ admin, uid }: { admin: User; uid: string }) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [target, setTarget] = useState<UserProfile | null | undefined>(undefined);

  useEffect(() => {
    if (!db) return;
    let cancelled = false;
    getDoc(doc(db, 'admins', admin.uid))
      .then((s) => !cancelled && setIsAdmin(s.exists()))
      .catch(() => !cancelled && setIsAdmin(false));
    return () => {
      cancelled = true;
    };
  }, [admin.uid]);

  useEffect(() => {
    if (!db || !isAdmin) return;
    return onSnapshot(
      doc(db, 'users', uid),
      (s) => setTarget(s.exists() ? (s.data() as UserProfile) : null),
      () => setTarget(null),
    );
  }, [isAdmin, uid]);

  if (isAdmin === null || (isAdmin && target === undefined)) return <Message title="Loading…">{null}</Message>;
  if (!isAdmin) return <Message title="Not authorised"><p>Only TrialWiz admins can view the portal as another user.</p></Message>;
  if (!target) return <Message title="Account not found"><p>No profile exists for this account — it may have been deleted.</p></Message>;

  const label = accountLabel(target);
  const banner = (
    <div className="viewas-banner" role="status">
      👁 Viewing as <b>{target.name}</b> ({label}, {target.email}) — <b>read-only</b>. This is exactly what they see;
      buttons are disabled. <Link to="/admin">Exit</Link>
    </div>
  );

  if (target.role === 'user' || target.role === 'admin') {
    return (
      <Message title={`${target.name} — ${label}`}>
        <p>
          {target.role === 'admin'
            ? 'Admin accounts see the admin dashboard.'
            : 'Public accounts see the Trial Finder like any visitor. Their saved trials are private to them, so they can’t be shown here.'}
        </p>
        <Link className="go" to="/" style={{ display: 'inline-block', textAlign: 'center', textDecoration: 'none' }}>
          Open the public Trial Finder
        </Link>
      </Message>
    );
  }
  if (target.status !== 'approved') {
    return (
      <Message title={`${target.name} — ${label}`}>
        <p>
          This account is <b>{target.status ?? 'pending'}</b>, so they currently see the “
          {target.status === 'rejected' ? 'Request not approved' : 'Waiting for approval'}” screen instead of the dashboard.
          {target.role === 'coordinator' && target.requestedDoctorEmail && ` They're waiting on ${target.requestedDoctorEmail}.`}
        </p>
      </Message>
    );
  }

  // The dashboard only needs the viewed account's uid/email; it never touches auth in readOnly mode.
  const viewedUser = { uid: target.uid, email: target.email } as User;
  return (
    <>
      {banner}
      <DoctorDashboard user={viewedUser} profile={target} readOnly headerRight={<ExitLink />} />
    </>
  );
}
