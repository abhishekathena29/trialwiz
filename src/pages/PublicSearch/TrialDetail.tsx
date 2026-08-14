import type { TrialSite } from '../../types';
import { daysSince, lowerFirst, telHref } from '../../utils/format';
import { parseEligibility } from '../../utils/eligibility';
import {
  BackIcon,
  CalendarIcon,
  CheckIcon,
  FlaskIcon,
  HeartIcon,
  InfoIcon,
  MailIcon,
  PhoneIcon,
  PinIcon,
  UsersIcon,
  XCircleIcon,
} from './icons';

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

function formatStudyType(t: string | undefined): string {
  if (!t) return 'Not specified';
  return t.charAt(0) + t.slice(1).toLowerCase();
}

function formatDate(d: string | undefined): string {
  if (!d) return 'Not specified';
  const t = Date.parse(d);
  if (Number.isNaN(t)) return d;
  return new Date(t).toLocaleDateString('en-IN', { year: 'numeric', month: 'short' });
}

function printTrial(trial: TrialSite) {
  const w = window.open('', '_blank');
  if (!w) return;
  const { inclusion, exclusion } = parseEligibility(trial.eligibilityCriteria);
  w.document.write(`<!doctype html><html><head><title>${trial.nctId} — for your patient</title><style>
    body{font-family:sans-serif;padding:30px;max-width:640px;margin:0 auto;color:#20343a}
    h1{font-size:19px;margin:0 0 4px}
    .muted{color:#666;font-size:12px}
    h2{font-size:14px;margin:20px 0 6px}
    ul{margin:4px 0;padding-left:20px}
    .disc{margin-top:28px;font-size:12px;color:#666;border-top:1px solid #ccc;padding-top:12px}
  </style></head><body>
    <div class="muted">${trial.nctId}</div>
    <h1>A study is recruiting for people with ${lowerFirst(trial.cancerType)}.</h1>
    <p><b>${trial.facility}</b>${trial.city ? ` · ${trial.city}` : ''}${trial.state ? `, ${trial.state}` : ''}</p>
    ${trial.contactPhone ? `<p>📞 ${trial.contactPhone}</p>` : ''}
    ${trial.contactEmail ? `<p>✉ ${trial.contactEmail}</p>` : ''}
    <h2>Study summary</h2>
    <p>${trial.briefSummary || 'Not provided in the registry record.'}</p>
    ${inclusion.length ? `<h2>Inclusion criteria</h2><ul>${inclusion.map((i) => `<li>${i}</li>`).join('')}</ul>` : ''}
    ${exclusion.length ? `<h2>Exclusion criteria</h2><ul>${exclusion.map((i) => `<li>${i}</li>`).join('')}</ul>` : ''}
    <div class="disc">An information directory of publicly registered clinical trials. It does not determine eligibility or give medical advice. Only the trial investigator at the site can determine eligibility.</div>
  </body></html>`);
  w.document.close();
  w.print();
}

interface Props {
  trial: TrialSite;
  onBack: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

export function TrialDetail({ trial, onBack, isFavorite, onToggleFavorite }: Props) {
  const days = daysSince(trial.lastUpdatePostDate);
  const stale = days != null && days > STALE_AFTER_DAYS;
  const fresh = days == null ? 'confirmation date unknown' : `registry record updated ${days} day${days === 1 ? '' : 's'} ago`;
  const tel = telHref(trial.contactPhone);
  const { inclusion, exclusion } = parseEligibility(trial.eligibilityCriteria);
  const contactHref = trial.contactPhone ? `tel:${tel}` : trial.contactEmail ? `mailto:${trial.contactEmail}` : undefined;

  return (
    <div className="detail">
      <div className="detailtop">
        <button className="back" onClick={onBack}>
          <span className="backicon">
            <BackIcon />
          </span>
          <span className="backtext">Back</span>
        </button>
        {onToggleFavorite && (
          <button className={`favbtn${isFavorite ? ' on' : ''}`} onClick={onToggleFavorite} title={isFavorite ? 'Remove from saved' : 'Save this trial'}>
            <HeartIcon filled={isFavorite} />
          </button>
        )}
      </div>

      <div className="src">{trial.nctId}</div>
      <div className="pills">
        <span className="pill on">✓ {formatStatus(trial.overallStatus)}</span>
        {trial.phases
          .filter((p) => p && !/^na$/i.test(p))
          .map((p) => (
            <span className="pill" key={p}>
              {formatPhase(p)}
            </span>
          ))}
      </div>
      <h1 className="dheadline">
        A study is recruiting for people with {lowerFirst(trial.cancerType)}
        {trial.metastatic === 'mentioned' ? ' — the record mentions advanced/metastatic disease' : ''}.
      </h1>

      <div className="dcard">
        <div className="dlab">
          <FlaskIcon /> Type
        </div>
        <div className="dval">{formatStudyType(trial.studyType)}</div>
      </div>

      <div className="statrow">
        <div className="statcard">
          <div className="dlab">
            <UsersIcon /> Enrolment
          </div>
          <div className="dval">{trial.enrollmentCount ?? '—'}</div>
        </div>
        <div className="statcard">
          <div className="dlab">
            <CalendarIcon /> Start date
          </div>
          <div className="dval">{formatDate(trial.startDate)}</div>
        </div>
      </div>

      <div className="dcard loc">
        <div className="dlab accent">
          <PinIcon /> Primary location
        </div>
        <div className="facname">{trial.facility}</div>
        <div className="address">
          <PinIcon />
          <span>
            {[trial.city, trial.state].filter(Boolean).join(', ') || 'Location on file with the registry'}
          </span>
        </div>
        {trial.contactPhone && (
          <a className="address" href={`tel:${tel}`}>
            <PhoneIcon />
            <span>{trial.contactPhone}</span>
          </a>
        )}
        {trial.contactEmail && (
          <a className="address" href={`mailto:${trial.contactEmail}`}>
            <MailIcon />
            <span>{trial.contactEmail}</span>
          </a>
        )}
        {contactHref && (
          <a className="contactcta" href={contactHref}>
            <MailIcon /> Contact investigator
          </a>
        )}
      </div>

      <div className="dcard">
        <div className="dlab">
          <InfoIcon /> Study summary
        </div>
        <p className="summary">{trial.briefSummary || 'A detailed summary was not provided in the registry record.'}</p>
      </div>

      <div className="sechead">
        <h2>Eligibility criteria</h2>
      </div>
      {inclusion.length > 0 && (
        <div className="elig inc">
          <div className="dlab">
            <CheckIcon /> Inclusion criteria
          </div>
          <ul>
            {inclusion.map((item, i) => (
              <li key={i}>
                <CheckIcon /> <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {exclusion.length > 0 && (
        <div className="elig exc">
          <div className="dlab">
            <XCircleIcon /> Exclusion criteria
          </div>
          <ul>
            {exclusion.map((item, i) => (
              <li key={i}>
                <XCircleIcon /> <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {inclusion.length === 0 && exclusion.length === 0 && (
        <div className="dcard">
          <p className="summary">Eligibility criteria were not provided in a structured format in the registry record.</p>
        </div>
      )}

      <div className="meta">
        <span>Source: {trial.nctId}</span>
        <span className={`fresh${stale ? ' old' : ''}`}>{stale ? `⚠ status not confirmed for ${days} days` : fresh}</span>
      </div>

      <div className="acts">
        {trial.contactPhone && (
          <a className="btn primary" href={`tel:${tel}`}>
            Call site
          </a>
        )}
        <a className="btn" href={`https://clinicaltrials.gov/study/${trial.nctId}`} target="_blank" rel="noopener">
          Registry record
        </a>
        <span className="btn" onClick={() => printTrial(trial)}>
          Print for patient
        </span>
      </div>
    </div>
  );
}
