import { signOut, type User } from 'firebase/auth';
import { auth } from '../../firebase';
import type { UserProfile } from '../../types';
import { PortalHeader } from './PortalHeader';
import './Portal.css';

export function DoctorPending({ user, profile }: { user: User; profile: UserProfile }) {
  const rejected = profile.status === 'rejected';

  return (
    <div className="tw-admin">
      <PortalHeader
        right={
          <span className="lockpill" onClick={() => auth && signOut(auth)}>
            {user.email} · sign out
          </span>
        }
      />
      <div className="login-wrap" style={{ maxWidth: 520 }}>
        <div className="login-card">
          <div className="pending-badge">
            <span className={`pill ${rejected ? 'rejected' : 'pending'}`}>
              {rejected ? 'Verification Not Approved' : 'Pending Admin Verification'}
            </span>
          </div>

          <h1>{rejected ? 'Account Not Approved' : 'Principal Investigator Account Verification'}</h1>
          <p>
            {rejected
              ? `Your Principal Investigator account for ${profile.facility || 'your hospital'} could not be approved at this time. Please contact the TrialWiz administration team for assistance.`
              : `Welcome Dr. ${profile.name}! Your Principal Investigator account for ${profile.facility ? `"${profile.facility}"` : 'your hospital'} is currently under review by TrialWiz Administrators.`}
          </p>

          <div className="pending-box">
            <div className="pending-item">
              <span className="pi-label">Registered Hospital:</span>
              <b>{profile.facility || 'Not specified'}</b>
              {profile.city && <span> · {profile.city}</span>}
            </div>
            <div className="pending-item">
              <span className="pi-label">Account Email:</span>
              <span>{profile.email}</span>
            </div>
            <div className="pending-item">
              <span className="pi-label">Status:</span>
              <span style={{ color: rejected ? 'var(--red)' : '#9a6b00', fontWeight: 600 }}>
                {rejected ? 'Review completed — not approved' : 'Waiting for administrative approval'}
              </span>
            </div>
          </div>

          <div className="note" style={{ margin: '18px 0' }}>
            <b>Why verification is required:</b> To maintain clinical trial integrity and prevent unauthorized site claims,
            all doctor accounts undergo hospital site verification. Once verified, you can immediately:
            <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
              <li>View all ClinicalTrials.gov studies active at your hospital</li>
              <li>Claim trials and publish your direct study contact numbers</li>
              <li>Approve trial coordinators for your center</li>
            </ul>
          </div>

          <button className="go" onClick={() => auth && signOut(auth)}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
