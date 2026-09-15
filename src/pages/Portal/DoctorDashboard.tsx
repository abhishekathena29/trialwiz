import { signOut, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { auth } from '../../firebase';
import { approveCoordinator, rejectCoordinator, subscribeCoordinatorsForDoctor } from '../../services/profiles';
import type { UserProfile } from '../../types';
import { PortalHeader } from './PortalHeader';
import './Portal.css';

function RequestRow({ coordinator, onApprove, onReject }: { coordinator: UserProfile; onApprove: () => void; onReject: () => void }) {
  return (
    <div className="reqrow">
      <div className="reqinfo">
        <b>{coordinator.name}</b>
        <span>
          {coordinator.email} · {coordinator.facility}, {coordinator.city}
        </span>
      </div>
      <div className="reqactions">
        <button className="btn primary" onClick={onApprove}>
          Approve
        </button>
        <button className="btn" onClick={onReject}>
          Reject
        </button>
      </div>
    </div>
  );
}

export function DoctorDashboard({ user, profile }: { user: User; profile: UserProfile }) {
  const [coordinators, setCoordinators] = useState<UserProfile[]>([]);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  useEffect(() => subscribeCoordinatorsForDoctor(profile.email, setCoordinators), [profile.email]);

  const pending = coordinators.filter((c) => c.status === 'pending');
  const approved = coordinators.filter((c) => c.status === 'approved');
  const rejected = coordinators.filter((c) => c.status === 'rejected');

  async function handleApprove(c: UserProfile) {
    setBusyUid(c.uid);
    try {
      await approveCoordinator(c.uid, user.uid);
    } finally {
      setBusyUid(null);
    }
  }

  async function handleReject(c: UserProfile) {
    setBusyUid(c.uid);
    try {
      await rejectCoordinator(c.uid);
    } finally {
      setBusyUid(null);
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
      <div className="wrap">
        <div className="sechead2">
          <h2>Coordinator requests</h2>
          <span className="sup">Trial coordinators who named your email at sign-up</span>
        </div>
        <div className="card full">
          {pending.length === 0 ? (
            <div className="sup">No pending requests right now.</div>
          ) : (
            pending.map((c) => (
              <RequestRow
                key={c.uid}
                coordinator={c}
                onApprove={() => handleApprove(c)}
                onReject={() => handleReject(c)}
              />
            ))
          )}
        </div>

        <div className="sechead2">
          <h2>Your approved coordinators</h2>
        </div>
        <div className="card full">
          {approved.length === 0 ? (
            <div className="sup">None approved yet — approve a request above to let them start adding trials.</div>
          ) : (
            approved.map((c) => (
              <div className="reqrow" key={c.uid}>
                <div className="reqinfo">
                  <b>{c.name}</b>
                  <span>
                    {c.email} · {c.facility}, {c.city}
                  </span>
                </div>
                <span className="pill approved">Approved</span>
              </div>
            ))
          )}
        </div>

        {rejected.length > 0 && (
          <>
            <div className="sechead2">
              <h2>Rejected</h2>
            </div>
            <div className="card full">
              {rejected.map((c) => (
                <div className="reqrow" key={c.uid}>
                  <div className="reqinfo">
                    <b>{c.name}</b>
                    <span>{c.email}</span>
                  </div>
                  <button className="btn" disabled={busyUid === c.uid} onClick={() => handleApprove(c)}>
                    Approve instead
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="note">
          Approving a coordinator lets them add clinical trials to TrialWiz under their named hospital/centre. Trials
          they submit go live immediately in the public Trial Finder.
        </div>
      </div>
    </div>
  );
}
