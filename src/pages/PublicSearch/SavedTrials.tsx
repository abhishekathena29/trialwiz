import { signOut, type User } from 'firebase/auth';
import type { FavoriteEntry } from '../../hooks/useFavorites';
import { auth } from '../../firebase';
import type { TrialSite } from '../../types';
import { groupByNctId, type GroupedTrial } from '../../utils/groupTrials';
import { AuthPanel } from './AuthPanel';
import { TrialCard } from './TrialCard';

function toGroupedTrial(f: FavoriteEntry): GroupedTrial {
  return {
    key: f.nctId,
    nctId: f.nctId,
    briefTitle: f.briefTitle,
    conditions: [],
    cancerType: f.cancerType,
    overallStatus: 'RECRUITING',
    phases: [],
    metastatic: 'unspecified',
    lineOfTherapy: 'unspecified',
    sites: f.facility ? [{ key: `${f.nctId}__saved`, facility: f.facility, city: f.city }] : [],
  };
}

interface Props {
  user: User | null;
  authLoading: boolean;
  favorites: FavoriteEntry[];
  rows: TrialSite[];
  onOpenDetail: (trial: GroupedTrial) => void;
  onToggleFavorite: (trial: GroupedTrial) => void;
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

  const liveByNctId = new Map(groupByNctId(rows).map((g) => [g.nctId, g]));

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
            const trial = liveByNctId.get(f.nctId) ?? toGroupedTrial(f);
            return (
              <TrialCard
                key={f.nctId}
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
