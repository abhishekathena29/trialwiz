import { CANCERS, groupOf, SOLID_SYSTEMS, SYS } from '../../data/cancerTaxonomy';
import type { TrialSite } from '../../types';
import { countUniqueTrials, tallyByCancerType } from '../../utils/trialStats';

interface Props {
  rows: TrialSite[];
  group: 'solid' | 'blood';
  system: string;
  onGroupChange: (g: 'solid' | 'blood') => void;
  onSystemChange: (s: string) => void;
  onOpenCancer: (cancerType: string) => void;
}

function Tiles({ list, onOpen }: { list: [string, number][]; onOpen: (c: string) => void }) {
  return (
    <div className="grid">
      {list.map(([c, n]) => (
        <button
          key={c}
          className={`tile${n ? '' : ' zero'}`}
          onClick={n ? () => onOpen(c) : undefined}
        >
          <div className="nm">{c}</div>
          <div className="badge">
            {n}
            <span>{n === 1 ? 'trial' : 'trials'}</span>
          </div>
          {n ? <div className="arrow">›</div> : null}
        </button>
      ))}
    </div>
  );
}

export function BrowseByCancer({ rows, group, system, onGroupChange, onSystemChange, onOpenCancer }: Props) {
  const t = tallyByCancerType(rows);
  const solidN = countUniqueTrials(rows.filter((r) => groupOf(r.cancerType) === 'solid'));
  const bloodN = countUniqueTrials(rows.filter((r) => groupOf(r.cancerType) === 'blood'));

  return (
    <div>
      <div className="canjump">
        <label className="lab" htmlFor="cancerjump">
          By cancer type
        </label>
        <select
          id="cancerjump"
          className="sys"
          value=""
          onChange={(e) => {
            if (e.target.value) onOpenCancer(e.target.value);
            e.target.value = '';
          }}
        >
          <option value="">Jump to a cancer type…</option>
          {[...CANCERS]
            .sort((a, b) => (t[b] || 0) - (t[a] || 0))
            .map((c) => (
              <option key={c} value={c} disabled={!t[c]}>
                {c} ({t[c] || 0})
              </option>
            ))}
        </select>
      </div>
      <div className="grouprow">
        <button className={`gbtn${group === 'solid' ? ' on' : ''}`} onClick={() => onGroupChange('solid')}>
          Solid-organ <span className="gb">{solidN}</span>
        </button>
        <button className={`gbtn${group === 'blood' ? ' on' : ''}`} onClick={() => onGroupChange('blood')}>
          Blood / Haematology <span className="gb">{bloodN}</span>
        </button>
        {group === 'solid' && (
          <span className="sysdrop">
            <select className="sys" value={system} onChange={(e) => onSystemChange(e.target.value)}>
              <option value="All">All body systems</option>
              {SOLID_SYSTEMS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </span>
        )}
      </div>

      {group === 'blood' ? (
        <>
          <div className="sechead">
            <h2>Blood / Haematology</h2>
            <span className="cnt">{bloodN} trials</span>
          </div>
          <Tiles
            list={CANCERS.filter((c) => groupOf(c) === 'blood')
              .map((c) => [c, t[c] || 0] as [string, number])
              .sort((a, b) => b[1] - a[1])}
            onOpen={onOpenCancer}
          />
        </>
      ) : (
        <>
          <div className="sechead">
            <h2>Solid-organ cancers</h2>
            <span className="cnt">
              {solidN} trials{system === 'All' ? '' : ` · ${system}`}
            </span>
          </div>
          {(system === 'All' ? SOLID_SYSTEMS : [system]).map((sysName) => {
            const list = CANCERS.filter((c) => SYS[c] === sysName)
              .map((c) => [c, t[c] || 0] as [string, number])
              .sort((a, b) => b[1] - a[1]);
            if (!list.length) return null;
            return (
              <div key={sysName}>
                {system === 'All' && <div className="syshead">{sysName}</div>}
                <Tiles list={list} onOpen={onOpenCancer} />
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
