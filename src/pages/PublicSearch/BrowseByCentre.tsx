import { useMemo, useState } from 'react';
import type { TrialSite } from '../../types';
import { initials, PLACEHOLDER_LABEL } from '../../utils/format';
import { tallyByCentre } from '../../utils/trialStats';

/** Every word of the query must appear in the centre's name or city — "tata mumbai" finds
 * "Tata Memorial Hospital, Mumbai", word order doesn't matter. */
function matchesCentre(query: string, facility: string, city: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${facility} ${city}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function BrowseByCentre({
  rows,
  onOpenCentre,
}: {
  rows: TrialSite[];
  onOpenCentre: (facility: string, city: string) => void;
}) {
  const [query, setQuery] = useState('');
  const all = useMemo(() => tallyByCentre(rows), [rows]);
  const items = useMemo(() => all.filter((c) => matchesCentre(query, c.facility, c.city)), [all, query]);
  const searching = query.trim().length > 0;

  return (
    <div>
      <div className="sechead">
        <h2>Browse by centre</h2>
        <span className="cnt">{searching ? `${items.length} of ${all.length}` : all.length} centres</span>
      </div>
      <input
        type="search"
        className="centresearch"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search hospital or city — e.g. Tata Memorial, AIIMS, Chennai"
        aria-label="Search centres"
      />
      <div className="clist">
        {items.length ? (
          items.map(({ key, facility, city, count, placeholder }) => {
            return (
              <button key={key} className="crow" onClick={() => onOpenCentre(facility, city)}>
                <div className="ci">{placeholder ? '?' : initials(facility)}</div>
                <div className="cn">
                  <b>{placeholder ? `${PLACEHOLDER_LABEL} (${facility})` : facility}</b>
                  <span>{city}</span>
                </div>
                <div className="cb">
                  {count} {count === 1 ? 'trial' : 'trials'}
                </div>
              </button>
            );
          })
        ) : searching ? (
          <div className="empty">
            No centre matches <b>{query.trim()}</b>. Check the spelling, or try just part of the name.
          </div>
        ) : (
          <div className="empty">
            No centres in this area. Try <b>All India</b> or a wider radius.
          </div>
        )}
      </div>
    </div>
  );
}
