import { useState } from 'react';
import { logUsage } from '../../analytics/usageLog';
import { useTrialClaims } from '../../hooks/useTrialClaims';
import type { GroupedTrial, TrialLocation } from '../../utils/groupTrials';
import { daysSince, telHref } from '../../utils/format';
import { printTrial } from '../../utils/printTrial';
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

function SiteBlock({ site, nctId }: { site: TrialLocation; nctId: string }) {
  const { getClaim } = useTrialClaims();
  const claim = getClaim(nctId, site.facility);
  const phone = claim?.contactPhone || site.contactPhone;
  const email = claim?.contactEmail || site.contactEmail;
  const name = claim?.contactName || site.contactName;
  const tel = telHref(phone);

  return (
    <div className="siteblock">
      <div className="site">
        <span className="fac">{site.facility}</span>
        {site.city && <span>· {site.city}</span>}
        {site.distanceKm != null && <span className="dist">{site.distanceKm} km</span>}
      </div>
      {claim && (
        <div className="verified-pi-tag">
          🛡️ Verified Site Lead: <b>{claim.contactName}</b>
        </div>
      )}
      <div className="contact">
        {name ? (
          <>
            {name}
            <br />
          </>
        ) : null}
        {phone ? (
          <a href={`tel:${tel}`}>📞 {phone}</a>
        ) : (
          <span style={{ color: 'var(--muted)' }}>Contact via registry record</span>
        )}
        {email ? (
          <>
            {' '}
            &nbsp;·&nbsp; <a href={`mailto:${email}`}>{email}</a>
          </>
        ) : null}
      </div>
    </div>
  );
}

interface Props {
  trial: GroupedTrial;
  onOpenDetail?: (trial: GroupedTrial) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (trial: GroupedTrial) => void;
}

export function TrialCard({ trial, onOpenDetail, isFavorite, onToggleFavorite }: Props) {
  const { getClaim } = useTrialClaims();
  const [showAllSites, setShowAllSites] = useState(false);
  const days = daysSince(trial.lastUpdatePostDate);
  const stale = days != null && days > STALE_AFTER_DAYS;
  const fresh = days == null ? 'confirmation date unknown' : `registry record updated ${days} day${days === 1 ? '' : 's'} ago`;
  const setLabel = LINE_LABEL[trial.lineOfTherapy] ?? '';
  const primary = trial.sites[0];
  const primaryClaim = primary ? getClaim(trial.nctId, primary.facility) : undefined;
  const primaryPhone = primaryClaim?.contactPhone || primary?.contactPhone;
  const primaryEmail = primaryClaim?.contactEmail || primary?.contactEmail;
  const primaryName = primaryClaim?.contactName || primary?.contactName;
  const tel = telHref(primaryPhone);
  const metastaticNote = trial.metastatic === 'mentioned' ? 'advanced/metastatic disease mentioned' : '';
  const why = [trial.cancerType, primary?.city, setLabel, metastaticNote].filter(Boolean).join(' · ');
  const moreSites = trial.sites.slice(1);
  const isRegistryTrial = /^NCT\d/.test(trial.nctId);

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
        {trial.sites.length > 1 && <span className="pill sites">📍 {trial.sites.length} India sites</span>}
        {primaryClaim && <span className="pill verified-claim-pill">🛡️ Verified PI Site</span>}
      </div>
      <h2 className={`headline${onOpenDetail ? ' clickable' : ''}`} onClick={() => onOpenDetail?.(trial)}>
        {trial.briefTitle}
      </h2>
      {primary && (
        <div className="site">
          <span className="fac">{primary.facility}</span>
          {primary.city && <span>· {primary.city}</span>}
          {primary.distanceKm != null && <span className="dist">{primary.distanceKm} km</span>}
        </div>
      )}
      {primaryClaim && (
        <div className="verified-pi-banner">
          <span className="shield-icon">🛡️</span>
          <span>Verified Site Lead: <b>{primaryClaim.contactName}</b></span>
          {primaryClaim.department && <span className="dept-note"> · {primaryClaim.department}</span>}
        </div>
      )}
      <div className="contact">
        {primaryName ? (
          <>
            {primaryName}
            <br />
          </>
        ) : null}
        {primaryPhone ? (
          <a href={`tel:${tel}`}>📞 {primaryPhone}</a>
        ) : (
          <span style={{ color: 'var(--muted)' }}>Contact via registry record</span>
        )}
        {primaryEmail ? (
          <>
            {' '}
            &nbsp;·&nbsp; <a href={`mailto:${primaryEmail}`}>{primaryEmail}</a>
          </>
        ) : null}
      </div>
      {moreSites.length > 0 && (
        <>
          <button className="moresites" onClick={() => setShowAllSites((v) => !v)}>
            {showAllSites ? '▾ Hide other locations' : `▸ Also recruiting at ${moreSites.length} more location${moreSites.length === 1 ? '' : 's'}`}
          </button>
          {showAllSites && (
            <div className="sitesexpand">
              {moreSites.map((s) => (
                <SiteBlock key={s.key} site={s} nctId={trial.nctId} />
              ))}
            </div>
          )}
        </>
      )}
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
        {primary?.contactPhone && (
          <a className="btn primary" href={`tel:${tel}`} onClick={() => logUsage('click', 'Call site', trial.nctId)}>
            Call nearest site
          </a>
        )}
        {isRegistryTrial ? (
          <a
            className="btn"
            href={`https://clinicaltrials.gov/study/${trial.nctId}`}
            target="_blank"
            rel="noopener"
            onClick={() => logUsage('click', 'Registry record', trial.nctId)}
          >
            Registry record
          </a>
        ) : (
          <span className="pill" title="Added directly by a hospital's trial coordinator, not from ClinicalTrials.gov">
            Hospital-submitted
          </span>
        )}
        <span
          className="btn"
          onClick={() => {
            printTrial(trial);
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
