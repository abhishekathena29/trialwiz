import { logUsage } from '../../analytics/usageLog';
import type { TrialSite } from '../../types';
import { daysSince, lowerFirst, telHref } from '../../utils/format';
import { HeartIcon } from './icons';

const STALE_AFTER_DAYS = 30;

function formatPhase(p: string): string {
  const m = /phase\s*(\d)/i.exec(p);
  if (m) return `Phase ${m[1]}`;
  if (/^n\/?a$/i.test(p)) return 'N/A';
  return p;
}

function formatStatus(s: string): string {
  return s
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const LINE_LABEL: Record<string, string> = {
  neoadjuvant: 'neoadjuvant',
  adjuvant: 'adjuvant',
  'first-line': 'line 1',
  'second-line': 'line 2',
  'third-line-plus': 'line 3+',
};

function printCard(cardKey: string) {
  const el = document.getElementById(`trial-${cardKey}`);
  if (!el) return;
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.acts, .topcluster').forEach((n) => n.remove());
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(
    `<html><head><title>Trial — for your patient</title><style>body{font-family:sans-serif;padding:30px;max-width:600px;color:#20343a}h2{font-size:18px}.disc{margin-top:28px;font-size:12px;color:#666;border-top:1px solid #ccc;padding-top:12px}</style></head><body>${clone.innerHTML}<div class="disc">An information directory of publicly registered clinical trials. It does not determine eligibility or give medical advice. Only the trial investigator at the site can determine eligibility.</div></body></html>`,
  );
  w.document.close();
  w.print();
}

interface Props {
  trial: TrialSite;
  onOpenDetail?: (trial: TrialSite) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (trial: TrialSite) => void;
}

export function TrialCard({ trial, onOpenDetail, isFavorite, onToggleFavorite }: Props) {
  const days = daysSince(trial.lastUpdatePostDate);
  const stale = days != null && days > STALE_AFTER_DAYS;
  const fresh = days == null ? 'confirmation date unknown' : `registry record updated ${days} day${days === 1 ? '' : 's'} ago`;
  const setLabel = LINE_LABEL[trial.lineOfTherapy] ?? '';
  const tel = telHref(trial.contactPhone);
  const why = [trial.cancerType, trial.city, setLabel].filter(Boolean).join(' · ');

  return (
    <div id={`trial-${trial.key}`} className={`trial${stale ? ' stale' : ''}`}>
      <div className="topcluster">
        {onToggleFavorite && (
          <button
            className={`favbtn${isFavorite ? ' on' : ''}`}
            onClick={() => onToggleFavorite(trial)}
            title={isFavorite ? 'Remove from saved' : 'Save this trial'}
          >
            <HeartIcon filled={isFavorite} />
          </button>
        )}
        <span className="src">{trial.nctId}</span>
      </div>
      <div className="pills">
        <span className="pill on">✓ {formatStatus(trial.overallStatus)}</span>
        {trial.phases.filter((p) => p && !/^na$/i.test(p)).map((p) => (
          <span className="pill" key={p}>
            {formatPhase(p)}
          </span>
        ))}
      </div>
      <h2 className={`headline${onOpenDetail ? ' clickable' : ''}`} onClick={() => onOpenDetail?.(trial)}>
        A study is recruiting for people with {lowerFirst(trial.cancerType)}
        {trial.metastatic === 'mentioned' ? ' — the record mentions advanced/metastatic disease' : ''}.
      </h2>
      <div className="site">
        <span className="fac">{trial.facility}</span>
        {trial.city && <span>· {trial.city}</span>}
        {trial.distanceKm != null && <span className="dist">{trial.distanceKm} km</span>}
      </div>
      <div className="contact">
        {trial.contactName ? (
          <>
            {trial.contactName}
            <br />
          </>
        ) : null}
        {trial.contactPhone ? (
          <a href={`tel:${tel}`}>📞 {trial.contactPhone}</a>
        ) : (
          <span style={{ color: 'var(--muted)' }}>Contact via registry record</span>
        )}
        {trial.contactEmail ? (
          <>
            {' '}
            &nbsp;·&nbsp; <a href={`mailto:${trial.contactEmail}`}>{trial.contactEmail}</a>
          </>
        ) : null}
      </div>
      <div className="why">
        <b>Why this appeared:</b> {why}
      </div>
      <div className="meta">
        <span>Source: {trial.nctId}</span>
        <span className={`fresh${stale ? ' old' : ''}`}>
          {stale ? `⚠ status not confirmed for ${days} days` : fresh}
        </span>
      </div>
      <div className="acts">
        {trial.contactPhone && (
          <a className="btn primary" href={`tel:${tel}`} onClick={() => logUsage('click', 'Call site', trial.nctId)}>
            Call site
          </a>
        )}
        <a
          className="btn"
          href={`https://clinicaltrials.gov/study/${trial.nctId}`}
          target="_blank"
          rel="noopener"
          onClick={() => logUsage('click', 'Registry record', trial.nctId)}
        >
          Registry record
        </a>
        <span
          className="btn"
          onClick={() => {
            printCard(trial.key);
            logUsage('click', 'Print for patient', trial.nctId);
          }}
        >
          Print for patient
        </span>
        {onOpenDetail && (
          <span
            className="btn"
            onClick={() => {
              onOpenDetail(trial);
              logUsage('click', 'Full details', trial.nctId);
            }}
          >
            Full details
          </span>
        )}
      </div>
    </div>
  );
}
