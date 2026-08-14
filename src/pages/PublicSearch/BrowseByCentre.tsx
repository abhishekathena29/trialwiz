import type { TrialSite } from '../../types';
import { centreKey, initials } from '../../utils/format';

export function BrowseByCentre({
  rows,
  onOpenCentre,
}: {
  rows: TrialSite[];
  onOpenCentre: (facility: string, city: string) => void;
}) {
  const counts: Record<string, number> = {};
  const info: Record<string, { facility: string; city: string }> = {};
  for (const r of rows) {
    const key = centreKey(r.facility, r.city);
    counts[key] = (counts[key] || 0) + 1;
    info[key] = { facility: r.facility, city: r.city };
  }
  const items = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <div className="sechead">
        <h2>Browse by centre</h2>
        <span className="cnt">{items.length} centres</span>
      </div>
      <div className="clist">
        {items.length ? (
          items.map(([key, n]) => {
            const { facility, city } = info[key];
            return (
              <button key={key} className="crow" onClick={() => onOpenCentre(facility, city)}>
                <div className="ci">{initials(facility)}</div>
                <div className="cn">
                  <b>{facility}</b>
                  <span>{city}</span>
                </div>
                <div className="cb">
                  {n} {n === 1 ? 'trial' : 'trials'}
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
