export interface ParsedEligibility {
  inclusion: string[];
  exclusion: string[];
}

const BULLET_PREFIX = /^\s*(?:[-*•]|\(?\d{1,2}[.)])\s*/;

function extractItems(section: string): string[] {
  return section
    .split(/\n+/)
    .map((line) => line.replace(BULLET_PREFIX, '').trim())
    .filter(Boolean)
    .slice(0, 12);
}

/**
 * ClinicalTrials.gov `eligibilityCriteria` is free text, almost always shaped as
 * "Inclusion Criteria:\n...\n\nExclusion Criteria:\n..." with numbered or bulleted lines.
 * This is a best-effort split — registries don't guarantee the format.
 */
export function parseEligibility(text: string | undefined): ParsedEligibility {
  if (!text) return { inclusion: [], exclusion: [] };

  const incMatch = /inclusion criteria/i.exec(text);
  const excMatch = /exclusion criteria/i.exec(text);

  let incSection = '';
  let excSection = '';

  if (incMatch && excMatch && excMatch.index > incMatch.index) {
    incSection = text.slice(incMatch.index, excMatch.index);
    excSection = text.slice(excMatch.index);
  } else if (incMatch) {
    incSection = text.slice(incMatch.index);
  } else if (excMatch) {
    excSection = text.slice(excMatch.index);
  } else {
    incSection = text;
  }

  const stripHeader = (s: string, label: RegExp) => s.replace(label, '').replace(/^[\s:-]+/, '');

  return {
    inclusion: extractItems(stripHeader(incSection, /inclusion criteria:?/i)),
    exclusion: extractItems(stripHeader(excSection, /exclusion criteria:?/i)),
  };
}
