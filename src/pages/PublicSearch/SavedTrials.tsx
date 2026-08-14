import { signOut, type User } from 'firebase/auth';
import type { FavoriteEntry } from '../../hooks/useFavorites';
import { auth } from '../../firebase';
import type { TrialSite } from '../../types';
import { AuthPanel } from './AuthPanel';
import { TrialCard } from './TrialCard';

function toTrialSite(f: FavoriteEntry): TrialSite {
  return {
    key: f.key,
    nctId: f.nctId,
    briefTitle: f.briefTitle,
    conditions: [],
    cancerType: f.cancerType,
    overallStatus: 'RECRUITING',
    phases: [],
    facility: f.facility,
    city: f.city,
    metastatic: 'unspecified',
    lineOfTherapy: 'unspecified',
  };
}

interface Props {
  user: User | null;
  authLoading: boolean;
  favorites: FavoriteEntry[];
  rows: TrialSite[];
  onOpenDetail: (trial: TrialSite) => void;
  onToggleFavorite: (trial: TrialSite) => void;
}

export function SavedTrials({ user, authLoading, favorites, rows, onOpenDetail, onToggleFavorite }: Props) {
  if (authLoading) {
    return <div className="empty">Checking your session…</div>;
  }

  if (!user) {
    return (
      <div>
        <div className="sechead">
          <h2>Saved trials</h2>
        </div>
        <AuthPanel />
      </div>
    );
  }

  return (
    <div>
      <div className="sechead">
        <h2>Saved trials</h2>
        <span className="cnt">
          {favorites.length} saved &nbsp;·&nbsp;
          <button className="signoutlink" onClick={() => auth && signOut(auth)}>
            sign out
          </button>
        </span>
      </div>
      {favorites.length === 0 ? (
        <div className="empty">No trials saved yet — tap the ♡ on any trial to keep it here.</div>
      ) : (
        <div className="results">
          {favorites.map((f) => {
            const trial = rows.find((r) => r.key === f.key) ?? toTrialSite(f);
            return (
              <TrialCard
                key={f.key}
                trial={trial}
                onOpenDetail={onOpenDetail}
                isFavorite={true}
                onToggleFavorite={onToggleFavorite}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
