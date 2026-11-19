import { useEffect, useState } from 'react';
import {
  republishSubmittedTrial,
  retireSubmittedTrial,
  subscribeMySubmittedTrials,
  updateSubmittedTrialSite,
} from '../../services/trialSubmissions';
import { useClosedTrials } from '../../hooks/useClosedTrials';
import { reopenTrial, submittedCloseId } from '../../services/closedTrials';
import type { SubmittedTrial, UserProfile } from '../../types';
import { CloseTrialModal } from './CloseTrialModal';
import { SiteFormModal } from './SiteFormModal';
import './Portal.css';

export function MySubmittedTrials({
  uid,
  profile,
  onFlash,
}: {
  uid: string;
  profile: UserProfile;
  onFlash?: (message: string) => void;
}) {
  const [trials, setTrials] = useState<SubmittedTrial[]>([]);
  const [closing, setClosing] = useState<SubmittedTrial | null>(null);
  const closedTrials = useClosedTrials();
  const closedById = new Map(closedTrials.map((c) => [c.id, c]));

  async function reopen(t: SubmittedTrial) {
    const c = closedById.get(submittedCloseId(t.nctId));
    if (!c || !window.confirm(`Reopen ${t.nctId}? It will appear in the active trial lists again.`)) return;
    try {
      await reopenTrial(c, { uid, email: profile.email, name: profile.name });
      onFlash?.(`Reopened ${t.nctId}.`);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to reopen the trial.');
    }
  }
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<SubmittedTrial | null>(null);

  useEffect(() => subscribeMySubmittedTrials(uid, setTrials), [uid]);

  async function toggle(t: SubmittedTrial) {
    setBusyId(t.nctId);
    try {
      if (t.listingStatus === 'published') await retireSubmittedTrial(t.nctId);
      else await republishSubmittedTrial(t.nctId);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card full">
      <h2>Your submitted trials</h2>
      {trials.length === 0 ? (
        <div className="sup">You haven't submitted any trials yet — use the form above to add one.</div>
      ) : (
        trials.map((t) => {
          const closed = closedById.get(submittedCloseId(t.nctId));
          return (
          <div className="reqrow" key={t.nctId}>
            <div className="reqinfo">
              <b>{t.briefTitle}</b>
              <span>
                {t.cancerType} · {t.facility}, {t.city} · {t.nctId}
              </span>
            </div>
            {closed ? (
              <span className="pill closed-pill" title={closed.reason || undefined}>
                closed
              </span>
            ) : (
              <span className={`pill ${t.listingStatus}`}>{t.listingStatus}</span>
            )}
            <button className="btn" onClick={() => setEditing(t)} title="Change this trial's location and contact details">
              Edit location & contact
            </button>
            <button className="btn" disabled={busyId === t.nctId} onClick={() => toggle(t)}>
              {t.listingStatus === 'published' ? 'Retire' : 'Republish'}
            </button>
            {closed ? (
              closed.closedByUid === uid && (
                <button className="btn" onClick={() => reopen(t)}>
                  Reopen trial
                </button>
              )
            ) : (
              <button className="btn-danger" onClick={() => setClosing(t)} title="Mark this trial as closed — enrolment finished or stopped">
                Close trial
              </button>
            )}
          </div>
          );
        })
      )}
      {closing && (
        <CloseTrialModal
          closeId={submittedCloseId(closing.nctId)}
          target={closing}
          actor={{ uid, name: profile.name, email: profile.email }}
          badge="Trial creator action"
          onClose={() => setClosing(null)}
          onClosed={onFlash}
        />
      )}
      {editing && (
        <SiteFormModal
          badge="Edit Submitted Trial"
          title="Location & contact"
          subtitle={`${editing.briefTitle} · ${editing.nctId}`}
          initial={{
            facility: editing.facility,
            city: editing.city,
            state: editing.state,
            contactName: editing.contactName,
            contactPhone: editing.contactPhone,
            contactEmail: editing.contactEmail,
          }}
          submitLabel="Save changes"
          onSubmit={(f) => updateSubmittedTrialSite(editing.nctId, f)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
