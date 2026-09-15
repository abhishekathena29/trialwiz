import { signOut, type User } from 'firebase/auth';
import { useState } from 'react';
import { auth } from '../../firebase';
import { requestDoctor } from '../../services/profiles';
import type { UserProfile } from '../../types';
import { PortalHeader } from './PortalHeader';
import './Portal.css';

export function CoordinatorPending({ user, profile }: { user: User; profile: UserProfile }) {
  const [doctorEmail, setDoctorEmail] = useState(profile.requestedDoctorEmail ?? '');
  const [busy, setBusy] = useState(false);
  const rejected = profile.status === 'rejected';

  async function resend() {
    if (!doctorEmail.trim()) return;
    setBusy(true);
    try {
      await requestDoctor(user.uid, doctorEmail.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tw-admin">
      <PortalHeader
        right={
          <span className="lockpill" onClick={() => auth && signOut(auth)}>
            {user.email} · sign out
          </span>
        }
      />
      <div className="login-wrap">
        <div className="login-card">
          <h1>{rejected ? 'Request not approved' : 'Waiting for approval'}</h1>
          <p>
            {rejected
              ? `Your request naming ${profile.requestedDoctorEmail} wasn't approved. Check the email below and try again.`
              : `Your account is pending approval from ${profile.requestedDoctorEmail}. Once they approve you, you'll be able to add clinical trials for ${profile.facility}, ${profile.city}.`}
          </p>
          {rejected && (
            <>
              <label htmlFor="cdoc">Approving doctor's email</label>
              <input id="cdoc" type="email" value={doctorEmail} onChange={(e) => setDoctorEmail(e.target.value)} />
              <button className="go" onClick={resend} disabled={busy || !doctorEmail.trim()}>
                {busy ? 'Sending…' : 'Send request again'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
