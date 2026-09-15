import type { TrialSite } from '../../types';
import { initials } from '../../utils/format';
import { tallyByCentre } from '../../utils/trialStats';

export function BrowseByCentre({
  rows,
  onOpenCentre,
}: {
  rows: TrialSite[];
  onOpenCentre: (facility: string, city: string) => void;
}) {
  const items = tallyByCentre(rows);

  return (
    <div>
      <div className="sechead">
        <h2>Browse by centre</h2>
        <span className="cnt">{items.length} centres</span>
      </div>
      <div className="clist">
        {items.length ? (
          items.map(({ key, facility, city, count }) => {
            return (
              <button key={key} className="crow" onClick={() => onOpenCentre(facility, city)}>
                <div className="ci">{initials(facility)}</div>
                <div className="cn">
                  <b>{facility}</b>
                  <span>{city}</span>
                </div>
                <div className="cb">
                  {count} {count === 1 ? 'trial' : 'trials'}
                </div>
              </button>
            );
          })
        ) : (
          <div className="empty">
            No centres in this area. Try <b>All India</b> or a wider radius.
          </div>
        )}
      </div>
    </div>
  );
}
