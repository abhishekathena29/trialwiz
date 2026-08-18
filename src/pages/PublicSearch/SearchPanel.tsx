import { useMemo, useState } from 'react';
import { CANCERS } from '../../data/cancerTaxonomy';
import type { TrialSite } from '../../types';
import { groupByNctId, type GroupedTrial } from '../../utils/groupTrials';
import { TrialCard } from './TrialCard';

export interface SearchFilters {
  cond: string;
  met: 'any' | 'mentioned' | 'early-stage';
  line: 'any' | 'neoadjuvant' | 'adjuvant' | 'first-line' | 'second-line' | 'third-line-plus';
  bio: string;
  other: string;
}

const MET_CHIPS: Array<[SearchFilters['met'], string]> = [
  ['any', 'Any'],
  ['mentioned', 'Yes — spread'],
  ['early-stage', 'Early-stage'],
];
const LINE_CHIPS: Array<[SearchFilters['line'], string]> = [
  ['any', 'Any'],
  ['neoadjuvant', 'Neoadjuvant'],
  ['adjuvant', 'Adjuvant'],
  ['first-line', '1st line'],
  ['second-line', '2nd line'],
  ['third-line-plus', '3rd line+'],
];

function ChipGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<[T, string]>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="chips">
      {options.map(([v, label]) => (
        <span key={v} className={`chip${value === v ? ' on' : ''}`} onClick={() => onChange(v)}>
          {label}
        </span>
      ))}
    </div>
  );
}

interface Props {
  scopedCount: number;
  scopeWhereLabel: string;
  results: TrialSite[] | null;
  onSearch: (filters: SearchFilters) => void;
  onOpenDetail: (trial: GroupedTrial) => void;
  isFavorite: (trial: GroupedTrial) => boolean;
  onToggleFavorite: (trial: GroupedTrial) => void;
}

export function SearchPanel({ scopedCount, scopeWhereLabel, results, onSearch, onOpenDetail, isFavorite, onToggleFavorite }: Props) {
  const [cond, setCond] = useState('');
  const [met, setMet] = useState<SearchFilters['met']>('any');
  const [line, setLine] = useState<SearchFilters['line']>('any');
  const [bio, setBio] = useState('');
  const [other, setOther] = useState('');
  const groupedResults = useMemo(() => (results ? groupByNctId(results) : null), [results]);

  return (
    <div>
      <div className="sechead">
        <h2>Search</h2>
        <span className="cnt">{scopedCount} trials in scope</span>
      </div>
      <div className="searchcard">
        <div className="field">
          <label className="lab" htmlFor="scond">
            Cancer type
          </label>
          <input
            list="condlist2"
            id="scond"
            type="text"
            placeholder="e.g. lung cancer"
            autoComplete="off"
            value={cond}
            onChange={(e) => setCond(e.target.value)}
          />
          <datalist id="condlist2">
            {CANCERS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label className="lab">Spread (metastatic)?</label>
          <ChipGroup options={MET_CHIPS} value={met} onChange={setMet} />
        </div>
        <div className="field">
          <label className="lab">Therapy setting / line</label>
          <ChipGroup options={LINE_CHIPS} value={line} onChange={setLine} />
        </div>
        <div className="field">
          <label className="lab" htmlFor="sbio">
            Key biomarker <span style={{ fontWeight: 500, textTransform: 'none', color: 'var(--muted)' }}>(optional)</span>
          </label>
          <input
            id="sbio"
            type="text"
            placeholder="e.g. EGFR, HER2, PD-L1"
            autoComplete="off"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="lab" htmlFor="sother">
            Any other terms <span style={{ fontWeight: 500, textTransform: 'none', color: 'var(--muted)' }}>(optional)</span>
          </label>
          <input
            id="sother"
            type="text"
            placeholder="e.g. sponsor name, drug class, trial ID…"
            autoComplete="off"
            value={other}
            onChange={(e) => setOther(e.target.value)}
          />
        </div>
        <button className="go" onClick={() => onSearch({ cond: cond.trim(), met, line, bio: bio.trim(), other: other.trim() })}>
          Find trials
        </button>
      </div>

      {groupedResults !== null && (
        <div>
          <div className="listhead">
            <h2>
              <span className="n">{groupedResults.length}</span> {groupedResults.length === 1 ? 'trial' : 'trials'} found
            </h2>
            <p>
              {cond || 'all cancers'} · {scopeWhereLabel}
            </p>
          </div>
          {groupedResults.length ? (
            <div className="results">
              {groupedResults.map((t) => (
                <TrialCard
                  key={t.key}
                  trial={t}
                  onOpenDetail={onOpenDetail}
                  isFavorite={isFavorite(t)}
                  onToggleFavorite={onToggleFavorite}
                />
              ))}
            </div>
          ) : (
            <div className="empty">
              No trials matched — <b>and that search was still recorded</b> as demand. An unmet search is exactly
              the signal worth capturing. Try a wider radius or <b>All India</b>.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
