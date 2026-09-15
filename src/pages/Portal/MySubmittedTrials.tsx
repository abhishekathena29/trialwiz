import { useEffect, useState } from 'react';
import { republishSubmittedTrial, retireSubmittedTrial, subscribeMySubmittedTrials } from '../../services/trialSubmissions';
import type { SubmittedTrial } from '../../types';
import './Portal.css';

export function MySubmittedTrials({ uid }: { uid: string }) {
  const [trials, setTrials] = useState<SubmittedTrial[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

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
            <button className="btn" disabled={busyId === t.nctId} onClick={() => toggle(t)}>
              {t.listingStatus === 'published' ? 'Retire' : 'Republish'}
            </button>
          </div>
        ))
      )}
    </div>
  );
}
