import type { TrialSite } from '../../types';
import { BackIcon } from './icons';
import { TrialCard } from './TrialCard';

interface Props {
  title: string;
  subtitle: string;
  rows: TrialSite[];
  onBack: () => void;
  onOpenDetail: (trial: TrialSite) => void;
  isFavorite: (trial: TrialSite) => boolean;
  onToggleFavorite: (trial: TrialSite) => void;
}

export function TrialListView({ title, subtitle, rows, onBack, onOpenDetail, isFavorite, onToggleFavorite }: Props) {
  return (
    <div>
      <button className="back" onClick={onBack}>
        <span className="backicon">
          <BackIcon />
        </span>
        <span className="backtext">Back to browse</span>
      </button>
      <div className="listhead">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <div className="results">
        {rows.map((t) => (
          <TrialCard
            key={t.key}
            trial={t}
            onOpenDetail={onOpenDetail}
            isFavorite={isFavorite(t)}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </div>
    </div>
  );
}
