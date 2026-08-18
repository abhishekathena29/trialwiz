import type { GroupedTrial } from './groupTrials';
import { parseEligibility } from './eligibility';

function esc(s: string | undefined): string {
  if (!s) return '';
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * Builds the printable "for your patient" sheet. Used by both the card and detail
 * views so a patient handout always includes the study summary, every recruiting
 * India site, and eligibility criteria — not just whatever happened to be visible
 * on screen.
 */
export function printTrial(trial: GroupedTrial) {
  const w = window.open('', '_blank');
  if (!w) return;
  const { inclusion, exclusion } = parseEligibility(trial.eligibilityCriteria);
  const sitesHtml = trial.sites
    .map(
      (s) => `<div class="site">
        <p><b>${esc(s.facility)}</b>${s.city ? ` · ${esc(s.city)}` : ''}${s.state ? `, ${esc(s.state)}` : ''}</p>
        ${s.contactPhone ? `<p>📞 ${esc(s.contactPhone)}</p>` : ''}
        ${s.contactEmail ? `<p>✉ ${esc(s.contactEmail)}</p>` : ''}
      </div>`,
    )
    .join('');
  w.document.write(`<!doctype html><html><head><title>${esc(trial.nctId)} — for your patient</title><style>
    body{font-family:sans-serif;padding:30px;max-width:640px;margin:0 auto;color:#20343a}
    h1{font-size:19px;margin:0 0 4px}
    .muted{color:#666;font-size:12px}
    h2{font-size:14px;margin:20px 0 6px}
    ul{margin:4px 0;padding-left:20px}
    .site{margin-bottom:10px}
    .site:not(:last-child){border-bottom:1px solid #eee;padding-bottom:10px}
    .disc{margin-top:28px;font-size:12px;color:#666;border-top:1px solid #ccc;padding-top:12px}
  </style></head><body>
    <div class="muted">${esc(trial.nctId)}</div>
    <h1>${esc(trial.briefTitle)}</h1>
    <h2>${trial.sites.length > 1 ? `Recruiting sites in India (${trial.sites.length})` : 'Recruiting site'}</h2>
    ${sitesHtml}
    <h2>Study summary</h2>
    <p>${esc(trial.briefSummary) || 'Not provided in the registry record.'}</p>
    ${inclusion.length ? `<h2>Inclusion criteria</h2><ul>${inclusion.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
    ${exclusion.length ? `<h2>Exclusion criteria</h2><ul>${exclusion.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
    <div class="disc">An information directory of publicly registered clinical trials. It does not determine eligibility or give medical advice. Only the trial investigator at the site can determine eligibility.</div>
  </body></html>`);
  w.document.close();
  w.print();
}
