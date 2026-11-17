import { useEffect, useState } from 'react';
import {
  republishSubmittedTrial,
  retireSubmittedTrial,
  subscribeMySubmittedTrials,
  updateSubmittedTrialSite,
} from '../../services/trialSubmissions';
import type { SubmittedTrial } from '../../types';
import { SiteFormModal } from './SiteFormModal';
import './Portal.css';

export function MySubmittedTrials({ uid }: { uid: string }) {
  const [trials, setTrials] = useState<SubmittedTrial[]>([]);
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
        trials.map((t) => (
          <div className="reqrow" key={t.nctId}>
            <div className="reqinfo">
              <b>{t.briefTitle}</b>
              <span>
                {t.cancerType} · {t.facility}, {t.city} · {t.nctId}
              </span>
            </div>
            <span className={`pill ${t.listingStatus}`}>{t.listingStatus}</span>
            <button className="btn" onClick={() => setEditing(t)} title="Change this trial's location and contact details">
              Edit location & contact
            </button>
            <button className="btn" disabled={busyId === t.nctId} onClick={() => toggle(t)}>
              {t.listingStatus === 'published' ? 'Retire' : 'Republish'}
            </button>
          </div>
        ))
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
