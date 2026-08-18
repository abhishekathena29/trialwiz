import { logUsage } from '../../analytics/usageLog';
import type { GroupedTrial, TrialLocation } from '../../utils/groupTrials';
import { daysSince, telHref } from '../../utils/format';
import { parseEligibility } from '../../utils/eligibility';
import { printTrial } from '../../utils/printTrial';
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

function LocationCard({ site, label }: { site: TrialLocation; label: string }) {
  const tel = telHref(site.contactPhone);
  const contactHref = site.contactPhone ? `tel:${tel}` : site.contactEmail ? `mailto:${site.contactEmail}` : undefined;
  return (
    <div className="dcard loc">
      <div className="dlab accent">
        <PinIcon /> {label}
      </div>
      <div className="facname">{site.facility}</div>
      <div className="address">
        <PinIcon />
        <span>{[site.city, site.state].filter(Boolean).join(', ') || 'Location on file with the registry'}</span>
      </div>
      {site.contactPhone && (
        <a className="address" href={`tel:${tel}`}>
          <PhoneIcon />
          <span>{site.contactPhone}</span>
        </a>
      )}
      {site.contactEmail && (
        <a className="address" href={`mailto:${site.contactEmail}`}>
          <MailIcon />
          <span>{site.contactEmail}</span>
        </a>
      )}
      {contactHref && (
        <a className="contactcta" href={contactHref}>
          <MailIcon /> Contact investigator
        </a>
      )}
    </div>
  );
}

interface Props {
  trial: GroupedTrial;
  onBack: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

export function TrialDetail({ trial, onBack, isFavorite, onToggleFavorite }: Props) {
  const days = daysSince(trial.lastUpdatePostDate);
  const stale = days != null && days > STALE_AFTER_DAYS;
  const fresh = days == null ? 'confirmation date unknown' : `registry record updated ${days} day${days === 1 ? '' : 's'} ago`;
  const primary = trial.sites[0];
  const otherSites = trial.sites.slice(1);
  const tel = telHref(primary?.contactPhone);
  const { inclusion, exclusion } = parseEligibility(trial.eligibilityCriteria);

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
      <h1 className="dheadline">{trial.briefTitle}</h1>
      <div className="dsub">
        Recruiting for {trial.cancerType.toLowerCase()}
        {trial.metastatic === 'mentioned' ? ' — the record mentions advanced/metastatic disease' : ''}.
      </div>

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

      {primary && <LocationCard site={primary} label={trial.sites.length > 1 ? 'Nearest location' : 'Location'} />}
      {otherSites.length > 0 && (
        <>
          <div className="sechead">
            <h2>Also recruiting at {otherSites.length} more location{otherSites.length === 1 ? '' : 's'}</h2>
          </div>
          {otherSites.map((s, i) => (
            <LocationCard key={s.key} site={s} label={`Location ${i + 2}`} />
          ))}
        </>
      )}

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
        {primary?.contactPhone && (
          <a className="btn primary" href={`tel:${tel}`}>
            Call nearest site
          </a>
        )}
        <a className="btn" href={`https://clinicaltrials.gov/study/${trial.nctId}`} target="_blank" rel="noopener">
          Registry record
        </a>
        <span
          className="btn"
          onClick={() => {
            printTrial(trial);
            logUsage('click', 'Print for patient', trial.nctId);
          }}
        >
          Print for patient
        </span>
      </div>
    </div>
  );
}
