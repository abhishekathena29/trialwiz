// Layman cancer-type taxonomy used to bucket ClinicalTrials.gov free-text conditions
// into the browse groups shown in the UI. This is a heuristic classifier — the registry
// has no structured "cancer type" field, so we keyword-match against each study's
// conditions + brief title. Anything that matches nothing lands in "Other cancer" so
// no trial is silently dropped from the counts.

export const SYS: Record<string, string> = {
  'Lung cancer': 'Thoracic',
  Mesothelioma: 'Thoracic',
  'Oesophageal cancer': 'Gastrointestinal',
  'Gastric cancer': 'Gastrointestinal',
  'Colorectal cancer': 'Gastrointestinal',
  'Liver cancer': 'Gastrointestinal',
  'Pancreatic cancer': 'Gastrointestinal',
  'Gallbladder & bile duct cancer': 'Gastrointestinal',
  'Prostate cancer': 'Genitourinary',
  'Bladder cancer': 'Genitourinary',
  'Kidney cancer': 'Genitourinary',
  'Ovarian cancer': 'Gynaecological',
  'Cervical cancer': 'Gynaecological',
  'Endometrial cancer': 'Gynaecological',
  'Breast cancer': 'Breast',
  'Head & neck cancer': 'Head & neck',
  'Oral cancer': 'Head & neck',
  'Thyroid cancer': 'Endocrine',
  Melanoma: 'Skin',
  'Brain tumour': 'CNS',
  Sarcoma: 'Sarcoma',
  Leukaemia: 'Haematology',
  Lymphoma: 'Haematology',
  'Multiple myeloma': 'Haematology',
  'Pediatric cancer': 'Pediatric',
  Neuroblastoma: 'Pediatric',
  Retinoblastoma: 'Pediatric',
  'Wilms tumour': 'Pediatric',
  Medulloblastoma: 'Pediatric',
  'Ewing sarcoma': 'Pediatric',
  'Other cancer': 'Other',
};

export const CANCERS = Object.keys(SYS);

export const SOLID_SYSTEMS = [
  'Thoracic',
  'Gastrointestinal',
  'Genitourinary',
  'Gynaecological',
  'Breast',
  'Head & neck',
  'Endocrine',
  'Skin',
  'CNS',
  'Sarcoma',
  'Other',
];

export type CancerGroup = 'solid' | 'blood' | 'pediatric';

export const groupOf = (cancerType: string, customCategory?: string): CancerGroup => {
  if (customCategory === 'pediatric' || customCategory === 'blood' || customCategory === 'solid') {
    return customCategory;
  }
  if (SYS[cancerType] === 'Pediatric') return 'pediatric';
  if (SYS[cancerType] === 'Haematology') return 'blood';
  return 'solid';
};

/** Ordered keyword rules; first match wins. Order matters (e.g. head&neck before oral). */
const RULES: Array<[string, RegExp]> = [
  ['Neuroblastoma', /neuroblastoma/i],
  ['Retinoblastoma', /retinoblastoma/i],
  ['Wilms tumour', /wilms|nephroblastoma/i],
  ['Medulloblastoma', /medulloblastoma/i],
  ['Ewing sarcoma', /ewing/i],
  ['Pediatric cancer', /\b(pediatric|paediatric|childhood|infantile)\b.*(cancer|tumor|tumour|oncolog|malignan|blastom)/i],
  ['Lung cancer', /\b(lung|nsclc|sclc|pulmonary carcinom)/i],
  ['Mesothelioma', /mesotheli/i],
  ['Oesophageal cancer', /(o|e)sophag/i],
  ['Gallbladder & bile duct cancer', /gall\s*bladder|biliary|cholangiocarcinoma/i],
  ['Gastric cancer', /gastric|stomach/i],
  ['Colorectal cancer', /colorect|\bcolon\b|rectal|rectum/i],
  ['Liver cancer', /hepatocellular|liver cancer|hepatic carcinom/i],
  ['Pancreatic cancer', /pancrea/i],
  ['Prostate cancer', /prostate/i],
  ['Bladder cancer', /bladder cancer|urothelial/i],
  ['Kidney cancer', /kidney|renal cell/i],
  ['Ovarian cancer', /ovarian|ovary/i],
  ['Cervical cancer', /cervical|cervix/i],
  ['Endometrial cancer', /endometri|uterine/i],
  ['Breast cancer', /breast/i],
  ['Head & neck cancer', /head and neck|head\s*&\s*neck|oropharyn|laryng|nasopharyn|hypopharyn|salivary gland/i],
  ['Oral cancer', /oral cavity|oral cancer|tongue cancer|buccal/i],
  ['Thyroid cancer', /thyroid/i],
  ['Melanoma', /melanoma/i],
  ['Brain tumour', /glioblastoma|\bglioma\b|astrocytoma|brain tumor|brain tumour|meningioma/i],
  ['Sarcoma', /sarcoma/i],
  ['Leukaemia', /leukemia|leukaemia/i],
  ['Lymphoma', /lymphoma/i],
  ['Multiple myeloma', /myeloma/i],
];

export function classifyCancerType(conditions: string[], briefTitle: string): string {
  const haystack = [...conditions, briefTitle].join(' | ');
  for (const [type, re] of RULES) {
    if (re.test(haystack)) return type;
  }
  return 'Other cancer';
}
