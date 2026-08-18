import { CANCERS, groupOf, SOLID_SYSTEMS, SYS } from '../../data/cancerTaxonomy';
import type { TrialSite } from '../../types';

interface Props {
  rows: TrialSite[];
  group: 'solid' | 'blood';
  system: string;
  onGroupChange: (g: 'solid' | 'blood') => void;
  onSystemChange: (s: string) => void;
  onOpenCancer: (cancerType: string) => void;
}

/** Counts unique trials (NCT ids), not site rows — a trial with several India sites
 * should tally as one trial, not one per site. */
function tally(rows: TrialSite[]): Record<string, number> {
  const seen: Record<string, Set<string>> = {};
  for (const r of rows) (seen[r.cancerType] ??= new Set()).add(r.nctId);
  const out: Record<string, number> = {};
  for (const [k, ids] of Object.entries(seen)) out[k] = ids.size;
  return out;
}

function countUniqueTrials(rows: TrialSite[]): number {
  return new Set(rows.map((r) => r.nctId)).size;
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
  const t = tally(rows);
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
