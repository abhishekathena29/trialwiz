import { CITIES } from '../../data/cities';
import { REGIONS, REGION_NAMES, normalizeState } from '../../data/regions';
import type { TrialSite } from '../../types';

interface Props {
  locating: boolean;
  locActive: boolean;
  locButtonLabel: string;
  cityInput: string;
  allIndia: boolean;
  radiusEnabled: boolean;
  radiusOfLabel: string;
  radius: number;
  locMsg: string;
  rows: TrialSite[];
  region: string | null;
  regionState: string | null;
  onRequestLocation: () => void;
  onCityChange: (v: string) => void;
  onAllIndiaChange: (v: boolean) => void;
  onRadiusChange: (v: number) => void;
  onSelectRegion: (region: string) => void;
  onSelectRegionState: (state: string | null) => void;
  onClearRegion: () => void;
}

export function LocationBar({
  locating,
  locActive,
  locButtonLabel,
  cityInput,
  allIndia,
  radiusEnabled,
  radiusOfLabel,
  radius,
  locMsg,
  rows,
  region,
  regionState,
  onRequestLocation,
  onCityChange,
  onAllIndiaChange,
  onRadiusChange,
  onSelectRegion,
  onSelectRegionState,
  onClearRegion,
}: Props) {
  const regionCounts: Record<string, number> = {};
  for (const name of REGION_NAMES) regionCounts[name] = 0;
  const stateCounts: Record<string, number> = {};
  for (const r of rows) {
    const st = normalizeState(r.state);
    if (!st) continue;
    stateCounts[st] = (stateCounts[st] || 0) + 1;
    const home = REGION_NAMES.find((n) => REGIONS[n].includes(st));
    if (home) regionCounts[home] += 1;
  }

  return (
    <div className="locbar">
      <div className="locrow">
        <button className={`locbtn${locActive ? ' active' : ''}`} onClick={onRequestLocation} disabled={locating}>
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10Z"
              stroke="currentColor"
              strokeWidth="1.7"
            />
            <circle cx="12" cy="11" r="2.4" stroke="currentColor" strokeWidth="1.7" />
          </svg>
          <span>{locating ? 'Locating…' : locButtonLabel}</span>
        </button>
        <span className="ordiv">or</span>
        <span className="cityin">
          <input
            list="citylist"
            type="text"
            placeholder="type a city…"
            autoComplete="off"
            value={cityInput}
            onChange={(e) => onCityChange(e.target.value)}
          />
        </span>
        <datalist id="citylist">
          {Object.keys(CITIES).map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <label className="allin">
          <input type="checkbox" checked={allIndia} onChange={(e) => onAllIndiaChange(e.target.checked)} /> All&nbsp;India
        </label>
      </div>
      <div className={`radrow${radiusEnabled ? '' : ' off'}`}>
        <label>
          Within <span className="rv">{radius}</span> km of <span>{radiusOfLabel}</span>
        </label>
        <input
          type="range"
          min={25}
          max={1500}
          step={25}
          value={radius}
          disabled={!radiusEnabled}
          onChange={(e) => onRadiusChange(Number(e.target.value))}
        />
      </div>
      {locMsg && <div className="locmsg show">{locMsg}</div>}

      <div className="regionwrap">
        <div className="regionlabel">Or browse by region</div>
        <div className="regionrow">
          {REGION_NAMES.map((name) => {
            const count = regionCounts[name];
            const inPlay = region === name || count > 0;
            return (
              <button
                key={name}
                className={`regionbtn${region === name ? ' on' : ''}${inPlay ? '' : ' zero'}`}
                onClick={() => (region === name ? onClearRegion() : onSelectRegion(name))}
                title={inPlay ? undefined : 'No trials in this region for the current search scope'}
              >
                {name}
                <span className="rb">{count}</span>
              </button>
            );
          })}
        </div>
        {region && (
          <div className="statedrop">
            <select
              className="sys"
              value={regionState ?? ''}
              onChange={(e) => onSelectRegionState(e.target.value || null)}
            >
              <option value="">All of {region} ({regionCounts[region]})</option>
              {[...REGIONS[region]]
                .sort((a, b) => (stateCounts[b] || 0) - (stateCounts[a] || 0))
                .map((s) => (
                  <option key={s} value={s}>
                    {s} ({stateCounts[s] || 0})
                  </option>
                ))}
            </select>
            <button className="clearregion" onClick={onClearRegion}>
              ✕ clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
