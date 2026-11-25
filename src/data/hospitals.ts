/**
 * Directory of major cancer-treating hospitals in India, used to suggest a standard hospital name
 * while an account is created or edited — so "RGCIRC", "RGCI Rohini" and "Rajiv Gandhi Cancer
 * Institute & Research Centre" all end up stored as one name.
 *
 * `name` is the value saved on the profile. Keep it in the form registries use, and keep anything
 * that isn't the hospital's own name (branch, city) after a comma — the portal's hospital filter
 * only requires the part before the first "(" or "," to match a registry site.
 * `aliases` are abbreviations and other spellings people type; they are only used for searching.
 */
export interface Hospital {
  name: string;
  city: string;
  state: string;
  aliases?: string[];
}

const aiims = (city: string, state: string, extra: string[] = []): Hospital => ({
  name: `All India Institute of Medical Sciences, ${city}`,
  city,
  state,
  aliases: [`AIIMS ${city}`, ...extra],
});

export const HOSPITALS: Hospital[] = [
  // ── Delhi NCR ──
  aiims('New Delhi', 'Delhi', ['AIIMS Delhi', 'Dr. B.R.A. Institute Rotary Cancer Hospital', 'IRCH', 'BRAIRCH']),
  { name: 'Rajiv Gandhi Cancer Institute and Research Centre', city: 'Delhi', state: 'Delhi', aliases: ['RGCIRC', 'RGCI', 'Rajiv Gandhi Cancer Hospital', 'RGCI Rohini'] },
  { name: 'Max Super Speciality Hospital, Saket', city: 'New Delhi', state: 'Delhi', aliases: ['Max Saket', 'Max Hospital Saket'] },
  { name: 'Max Super Speciality Hospital, Patparganj', city: 'Delhi', state: 'Delhi', aliases: ['Max Patparganj'] },
  { name: 'Max Super Speciality Hospital, Vaishali', city: 'Ghaziabad', state: 'Uttar Pradesh', aliases: ['Max Vaishali'] },
  { name: 'BLK-Max Super Speciality Hospital', city: 'New Delhi', state: 'Delhi', aliases: ['BLK', 'BLK Max', 'BL Kapur'] },
  { name: 'Indraprastha Apollo Hospitals', city: 'New Delhi', state: 'Delhi', aliases: ['Apollo Delhi', 'Apollo Sarita Vihar', 'IAH'] },
  { name: 'Sir Ganga Ram Hospital', city: 'New Delhi', state: 'Delhi', aliases: ['SGRH', 'Ganga Ram'] },
  { name: 'Dharamshila Narayana Superspeciality Hospital', city: 'Delhi', state: 'Delhi', aliases: ['Dharamshila', 'DNSH'] },
  { name: 'Action Cancer Hospital', city: 'Delhi', state: 'Delhi', aliases: ['ACH', 'Action Balaji'] },
  { name: 'Delhi State Cancer Institute', city: 'Delhi', state: 'Delhi', aliases: ['DSCI'] },
  { name: 'Batra Hospital and Medical Research Centre', city: 'New Delhi', state: 'Delhi', aliases: ['Batra Hospital'] },
  { name: 'Fortis Hospital, Shalimar Bagh', city: 'Delhi', state: 'Delhi', aliases: ['Fortis Shalimar Bagh'] },
  { name: 'Manipal Hospital, Dwarka', city: 'New Delhi', state: 'Delhi', aliases: ['Manipal Dwarka'] },
  { name: 'Vardhman Mahavir Medical College and Safdarjung Hospital', city: 'New Delhi', state: 'Delhi', aliases: ['VMMC', 'Safdarjung'] },
  { name: 'Maulana Azad Medical College and Lok Nayak Hospital', city: 'New Delhi', state: 'Delhi', aliases: ['MAMC', 'LNJP', 'Lok Nayak'] },
  { name: 'Dr. Ram Manohar Lohia Hospital', city: 'New Delhi', state: 'Delhi', aliases: ['RML', 'ABVIMS'] },
  { name: 'Medanta The Medicity', city: 'Gurugram', state: 'Haryana', aliases: ['Medanta', 'Medicity', 'Medanta Gurgaon'] },
  { name: 'Fortis Memorial Research Institute', city: 'Gurugram', state: 'Haryana', aliases: ['FMRI', 'Fortis Gurgaon'] },
  { name: 'Artemis Hospital', city: 'Gurugram', state: 'Haryana', aliases: ['Artemis Gurgaon'] },
  { name: 'Jaypee Hospital', city: 'Noida', state: 'Uttar Pradesh', aliases: ['Jaypee Noida'] },
  { name: 'Fortis Hospital, Noida', city: 'Noida', state: 'Uttar Pradesh', aliases: ['Fortis Noida'] },

  // ── North ──
  { name: 'Postgraduate Institute of Medical Education and Research', city: 'Chandigarh', state: 'Chandigarh', aliases: ['PGIMER', 'PGI Chandigarh'] },
  { name: 'Homi Bhabha Cancer Hospital and Research Centre, Mullanpur', city: 'New Chandigarh', state: 'Punjab', aliases: ['HBCHRC Mullanpur', 'HBCH Punjab', 'Tata Mullanpur'] },
  { name: 'Homi Bhabha Cancer Hospital, Sangrur', city: 'Sangrur', state: 'Punjab', aliases: ['HBCH Sangrur', 'Tata Sangrur'] },
  { name: 'Dayanand Medical College and Hospital', city: 'Ludhiana', state: 'Punjab', aliases: ['DMCH', 'DMC Ludhiana'] },
  { name: 'Christian Medical College, Ludhiana', city: 'Ludhiana', state: 'Punjab', aliases: ['CMC Ludhiana'] },
  aiims('Bathinda', 'Punjab'),
  aiims('Rishikesh', 'Uttarakhand'),
  aiims('Jammu', 'Jammu and Kashmir'),
  { name: 'Sher-i-Kashmir Institute of Medical Sciences', city: 'Srinagar', state: 'Jammu and Kashmir', aliases: ['SKIMS'] },
  { name: 'Indira Gandhi Medical College', city: 'Shimla', state: 'Himachal Pradesh', aliases: ['IGMC Shimla'] },
  { name: 'Himalayan Institute of Medical Sciences', city: 'Dehradun', state: 'Uttarakhand', aliases: ['HIMS', 'Swami Rama Cancer Hospital', 'Jolly Grant'] },
  { name: 'Sanjay Gandhi Postgraduate Institute of Medical Sciences', city: 'Lucknow', state: 'Uttar Pradesh', aliases: ['SGPGI', 'SGPGIMS', 'PGI Lucknow'] },
  { name: "King George's Medical University", city: 'Lucknow', state: 'Uttar Pradesh', aliases: ['KGMU', 'KGMC'] },
  { name: 'Kalyan Singh Super Speciality Cancer Institute', city: 'Lucknow', state: 'Uttar Pradesh', aliases: ['KSSSCI'] },
  { name: 'Mahamana Pandit Madan Mohan Malaviya Cancer Centre', city: 'Varanasi', state: 'Uttar Pradesh', aliases: ['MPMMCC', 'Tata Varanasi'] },
  { name: 'Homi Bhabha Cancer Hospital, Varanasi', city: 'Varanasi', state: 'Uttar Pradesh', aliases: ['HBCH Varanasi', 'Lahartara'] },
  { name: 'Institute of Medical Sciences, Banaras Hindu University', city: 'Varanasi', state: 'Uttar Pradesh', aliases: ['IMS BHU', 'BHU', 'Sir Sunderlal Hospital'] },
  aiims('Gorakhpur', 'Uttar Pradesh'),
  aiims('Raebareli', 'Uttar Pradesh'),
  { name: 'Bhagwan Mahaveer Cancer Hospital and Research Centre', city: 'Jaipur', state: 'Rajasthan', aliases: ['BMCHRC', 'BMCH'] },
  { name: 'Sawai Man Singh Medical College and Hospital', city: 'Jaipur', state: 'Rajasthan', aliases: ['SMS', 'SMS Jaipur'] },
  { name: 'Mahatma Gandhi Medical College and Hospital', city: 'Jaipur', state: 'Rajasthan', aliases: ['MGMCH', 'MGUMST'] },
  { name: 'Acharya Tulsi Regional Cancer Treatment and Research Institute', city: 'Bikaner', state: 'Rajasthan', aliases: ['ATRCTRI', 'RCC Bikaner'] },
  aiims('Jodhpur', 'Rajasthan'),

  // ── West ──
  { name: 'Tata Memorial Hospital', city: 'Mumbai', state: 'Maharashtra', aliases: ['TMH', 'Tata Memorial Centre', 'TMC Mumbai', 'Tata Parel'] },
  { name: 'Advanced Centre for Treatment Research and Education in Cancer (ACTREC)', city: 'Navi Mumbai', state: 'Maharashtra', aliases: ['ACTREC', 'Tata Kharghar'] },
  { name: 'Kokilaben Dhirubhai Ambani Hospital', city: 'Mumbai', state: 'Maharashtra', aliases: ['KDAH', 'Kokilaben'] },
  { name: 'Jaslok Hospital and Research Centre', city: 'Mumbai', state: 'Maharashtra', aliases: ['Jaslok'] },
  { name: 'P. D. Hinduja Hospital and Medical Research Centre', city: 'Mumbai', state: 'Maharashtra', aliases: ['Hinduja', 'PD Hinduja'] },
  { name: 'Lilavati Hospital and Research Centre', city: 'Mumbai', state: 'Maharashtra', aliases: ['Lilavati'] },
  { name: 'Sir H. N. Reliance Foundation Hospital', city: 'Mumbai', state: 'Maharashtra', aliases: ['HN Reliance', 'Reliance Hospital'] },
  { name: 'Nanavati Max Super Speciality Hospital', city: 'Mumbai', state: 'Maharashtra', aliases: ['Nanavati'] },
  { name: 'Seth G. S. Medical College and KEM Hospital', city: 'Mumbai', state: 'Maharashtra', aliases: ['KEM Mumbai', 'GSMC'] },
  { name: 'Lokmanya Tilak Municipal General Hospital', city: 'Mumbai', state: 'Maharashtra', aliases: ['Sion Hospital', 'LTMGH'] },
  { name: 'Fortis Hospital, Mulund', city: 'Mumbai', state: 'Maharashtra', aliases: ['Fortis Mulund'] },
  { name: 'Asian Cancer Institute', city: 'Mumbai', state: 'Maharashtra', aliases: ['ACI Mumbai'] },
  { name: 'Ruby Hall Clinic', city: 'Pune', state: 'Maharashtra', aliases: ['Ruby Hall', 'Grant Medical Foundation'] },
  { name: 'Deenanath Mangeshkar Hospital and Research Centre', city: 'Pune', state: 'Maharashtra', aliases: ['DMH', 'Deenanath'] },
  { name: 'Jehangir Hospital', city: 'Pune', state: 'Maharashtra', aliases: ['Jehangir'] },
  { name: 'Sahyadri Super Speciality Hospital', city: 'Pune', state: 'Maharashtra', aliases: ['Sahyadri'] },
  { name: 'Prashanti Cancer Care Mission', city: 'Pune', state: 'Maharashtra', aliases: ['PCCM'] },
  { name: 'National Cancer Institute, Nagpur', city: 'Nagpur', state: 'Maharashtra', aliases: ['NCI Nagpur'] },
  { name: 'Rashtrasant Tukdoji Regional Cancer Hospital', city: 'Nagpur', state: 'Maharashtra', aliases: ['RSTRCH'] },
  aiims('Nagpur', 'Maharashtra'),
  { name: 'HCG Manavata Cancer Centre', city: 'Nashik', state: 'Maharashtra', aliases: ['Manavata', 'Curie Manavata'] },
  { name: 'Gujarat Cancer and Research Institute', city: 'Ahmedabad', state: 'Gujarat', aliases: ['GCRI'] },
  { name: 'Zydus Hospital', city: 'Ahmedabad', state: 'Gujarat', aliases: ['Zydus'] },
  { name: 'HCG Cancer Centre, Ahmedabad', city: 'Ahmedabad', state: 'Gujarat', aliases: ['HCG Ahmedabad'] },
  { name: 'Apollo Hospitals International', city: 'Ahmedabad', state: 'Gujarat', aliases: ['Apollo Ahmedabad', 'Apollo Gandhinagar'] },
  { name: 'Kailash Cancer Hospital and Research Centre', city: 'Vadodara', state: 'Gujarat', aliases: ['KCHRC', 'Goraj'] },
  { name: 'Goa Medical College', city: 'Bambolim', state: 'Goa', aliases: ['GMC Goa'] },

  // ── Central ──
  aiims('Bhopal', 'Madhya Pradesh'),
  { name: 'Jawaharlal Nehru Cancer Hospital and Research Centre', city: 'Bhopal', state: 'Madhya Pradesh', aliases: ['JNCHRC'] },
  { name: 'Sri Aurobindo Institute of Medical Sciences', city: 'Indore', state: 'Madhya Pradesh', aliases: ['SAIMS'] },
  { name: 'Choithram Hospital and Research Centre', city: 'Indore', state: 'Madhya Pradesh', aliases: ['Choithram'] },
  { name: 'Cancer Hospital and Research Institute, Gwalior', city: 'Gwalior', state: 'Madhya Pradesh', aliases: ['CHRI Gwalior'] },
  aiims('Raipur', 'Chhattisgarh'),
  { name: 'Balco Medical Centre', city: 'Raipur', state: 'Chhattisgarh', aliases: ['BMC Raipur', 'Vedanta Balco'] },

  // ── South ──
  { name: 'Kidwai Memorial Institute of Oncology', city: 'Bengaluru', state: 'Karnataka', aliases: ['KMIO', 'Kidwai'] },
  { name: 'HCG Cancer Centre, Bengaluru', city: 'Bengaluru', state: 'Karnataka', aliases: ['HealthCare Global', 'Bangalore Institute of Oncology', 'HCG Bangalore'] },
  { name: 'Narayana Health City', city: 'Bengaluru', state: 'Karnataka', aliases: ['Mazumdar Shaw Medical Center', 'MSMC', 'Narayana Hrudayalaya'] },
  { name: "St. John's Medical College Hospital", city: 'Bengaluru', state: 'Karnataka', aliases: ['St Johns', 'SJMCH'] },
  { name: 'Manipal Hospital, Old Airport Road', city: 'Bengaluru', state: 'Karnataka', aliases: ['Manipal Bangalore', 'Manipal Comprehensive Cancer Centre'] },
  { name: 'Sri Shankara Cancer Hospital and Research Centre', city: 'Bengaluru', state: 'Karnataka', aliases: ['Shankara Cancer'] },
  { name: 'Cytecare Cancer Hospitals', city: 'Bengaluru', state: 'Karnataka', aliases: ['Cytecare'] },
  { name: 'Aster CMI Hospital', city: 'Bengaluru', state: 'Karnataka', aliases: ['Aster CMI'] },
  { name: 'Fortis Hospital, Bannerghatta Road', city: 'Bengaluru', state: 'Karnataka', aliases: ['Fortis Bangalore'] },
  { name: 'Kasturba Medical College and Hospital, Manipal', city: 'Manipal', state: 'Karnataka', aliases: ['KMC Manipal', 'Kasturba Hospital'] },
  { name: 'JSS Hospital', city: 'Mysuru', state: 'Karnataka', aliases: ['JSS Mysore'] },
  { name: 'KLES Dr. Prabhakar Kore Hospital and Medical Research Centre', city: 'Belagavi', state: 'Karnataka', aliases: ['KLE Belgaum', 'KLES'] },
  { name: 'Adyar Cancer Institute (WIA)', city: 'Chennai', state: 'Tamil Nadu', aliases: ['Cancer Institute WIA', 'CI WIA', 'Adyar'] },
  { name: 'Apollo Proton Cancer Centre', city: 'Chennai', state: 'Tamil Nadu', aliases: ['APCC', 'Apollo Proton'] },
  { name: 'Apollo Hospitals, Greams Road', city: 'Chennai', state: 'Tamil Nadu', aliases: ['Apollo Chennai', 'Apollo Cancer Centre Chennai'] },
  { name: 'MIOT International', city: 'Chennai', state: 'Tamil Nadu', aliases: ['MIOT'] },
  { name: 'Sri Ramachandra Institute of Higher Education and Research', city: 'Chennai', state: 'Tamil Nadu', aliases: ['SRIHER', 'SRMC', 'Sri Ramachandra Medical Centre'] },
  { name: 'Madras Medical College and Rajiv Gandhi Government General Hospital', city: 'Chennai', state: 'Tamil Nadu', aliases: ['MMC', 'RGGGH', 'Government General Hospital Chennai'] },
  { name: 'Dr. Kamakshi Memorial Hospital', city: 'Chennai', state: 'Tamil Nadu', aliases: ['Kamakshi'] },
  { name: 'Christian Medical College, Vellore', city: 'Vellore', state: 'Tamil Nadu', aliases: ['CMC Vellore'] },
  { name: 'Kovai Medical Center and Hospital', city: 'Coimbatore', state: 'Tamil Nadu', aliases: ['KMCH'] },
  { name: 'PSG Hospitals', city: 'Coimbatore', state: 'Tamil Nadu', aliases: ['PSG', 'PSGIMSR'] },
  { name: 'Sri Ramakrishna Hospital', city: 'Coimbatore', state: 'Tamil Nadu', aliases: ['SRH Coimbatore'] },
  { name: 'Meenakshi Mission Hospital and Research Centre', city: 'Madurai', state: 'Tamil Nadu', aliases: ['MMHRC', 'Meenakshi Mission'] },
  { name: 'Jawaharlal Institute of Postgraduate Medical Education and Research', city: 'Puducherry', state: 'Puducherry', aliases: ['JIPMER'] },
  { name: 'Basavatarakam Indo American Cancer Hospital and Research Institute', city: 'Hyderabad', state: 'Telangana', aliases: ['BIACH', 'BIACHRI', 'Indo American'] },
  { name: 'MNJ Institute of Oncology and Regional Cancer Centre', city: 'Hyderabad', state: 'Telangana', aliases: ['MNJIO', 'MNJ'] },
  { name: "Nizam's Institute of Medical Sciences", city: 'Hyderabad', state: 'Telangana', aliases: ['NIMS'] },
  { name: 'Apollo Hospitals, Jubilee Hills', city: 'Hyderabad', state: 'Telangana', aliases: ['Apollo Hyderabad', 'Apollo Cancer Institute Hyderabad'] },
  { name: 'American Oncology Institute', city: 'Hyderabad', state: 'Telangana', aliases: ['AOI'] },
  { name: 'Yashoda Hospitals', city: 'Hyderabad', state: 'Telangana', aliases: ['Yashoda'] },
  { name: 'Krishna Institute of Medical Sciences', city: 'Secunderabad', state: 'Telangana', aliases: ['KIMS Hyderabad', 'KIMS Secunderabad'] },
  { name: 'AIG Hospitals', city: 'Hyderabad', state: 'Telangana', aliases: ['Asian Institute of Gastroenterology', 'AIG'] },
  { name: 'Omega Hospitals', city: 'Hyderabad', state: 'Telangana', aliases: ['Omega'] },
  aiims('Bibinagar', 'Telangana'),
  { name: 'Homi Bhabha Cancer Hospital and Research Centre, Visakhapatnam', city: 'Visakhapatnam', state: 'Andhra Pradesh', aliases: ['HBCHRC Vizag', 'Tata Vizag'] },
  { name: 'Mahatma Gandhi Cancer Hospital and Research Institute', city: 'Visakhapatnam', state: 'Andhra Pradesh', aliases: ['MGCHRI'] },
  { name: 'Sri Venkateswara Institute of Medical Sciences', city: 'Tirupati', state: 'Andhra Pradesh', aliases: ['SVIMS'] },
  aiims('Mangalagiri', 'Andhra Pradesh'),
  { name: 'Regional Cancer Centre, Thiruvananthapuram', city: 'Thiruvananthapuram', state: 'Kerala', aliases: ['RCC Trivandrum', 'RCC Thiruvananthapuram'] },
  { name: 'Amrita Institute of Medical Sciences', city: 'Kochi', state: 'Kerala', aliases: ['Amrita Hospital', 'AIMS Kochi'] },
  { name: 'Aster Medcity', city: 'Kochi', state: 'Kerala', aliases: ['Aster Kochi'] },
  { name: 'VPS Lakeshore Hospital', city: 'Kochi', state: 'Kerala', aliases: ['Lakeshore'] },
  { name: 'Cochin Cancer Research Centre', city: 'Kochi', state: 'Kerala', aliases: ['CCRC'] },
  { name: 'Malabar Cancer Centre', city: 'Thalassery', state: 'Kerala', aliases: ['MCC'] },

  // ── East & North-East ──
  { name: 'Tata Medical Center', city: 'Kolkata', state: 'West Bengal', aliases: ['TMC Kolkata', 'Tata Kolkata'] },
  { name: 'Chittaranjan National Cancer Institute', city: 'Kolkata', state: 'West Bengal', aliases: ['CNCI'] },
  { name: 'Saroj Gupta Cancer Centre and Research Institute', city: 'Kolkata', state: 'West Bengal', aliases: ['SGCCRI', 'Thakurpukur'] },
  { name: 'Apollo Multispeciality Hospitals, Kolkata', city: 'Kolkata', state: 'West Bengal', aliases: ['Apollo Gleneagles', 'Apollo Kolkata'] },
  { name: 'Narayana Superspeciality Hospital, Howrah', city: 'Howrah', state: 'West Bengal', aliases: ['Narayana Howrah'] },
  { name: 'Institute of Post Graduate Medical Education and Research', city: 'Kolkata', state: 'West Bengal', aliases: ['IPGMER', 'SSKM'] },
  aiims('Kalyani', 'West Bengal'),
  { name: 'Acharya Harihar Post Graduate Institute of Cancer', city: 'Cuttack', state: 'Odisha', aliases: ['AHPGIC', 'AHRCC'] },
  { name: 'Kalinga Institute of Medical Sciences', city: 'Bhubaneswar', state: 'Odisha', aliases: ['KIMS Bhubaneswar'] },
  aiims('Bhubaneswar', 'Odisha'),
  aiims('Patna', 'Bihar'),
  { name: 'Mahavir Cancer Sansthan', city: 'Patna', state: 'Bihar', aliases: ['MCS', 'Mahavir Cancer'] },
  { name: 'Indira Gandhi Institute of Medical Sciences', city: 'Patna', state: 'Bihar', aliases: ['IGIMS'] },
  { name: 'Homi Bhabha Cancer Hospital and Research Centre, Muzaffarpur', city: 'Muzaffarpur', state: 'Bihar', aliases: ['HBCHRC Muzaffarpur', 'Tata Muzaffarpur'] },
  { name: 'Rajendra Institute of Medical Sciences', city: 'Ranchi', state: 'Jharkhand', aliases: ['RIMS'] },
  { name: 'Tata Main Hospital', city: 'Jamshedpur', state: 'Jharkhand', aliases: ['TMH Jamshedpur'] },
  aiims('Deoghar', 'Jharkhand'),
  { name: 'Dr. B. Borooah Cancer Institute', city: 'Guwahati', state: 'Assam', aliases: ['BBCI'] },
  aiims('Guwahati', 'Assam'),
  { name: 'Cachar Cancer Hospital and Research Centre', city: 'Silchar', state: 'Assam', aliases: ['CCHRC'] },
];

/** Lower-case words, punctuation dropped: "P. D. Hinduja" → ["p", "d", "hinduja"]. */
function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

const compact = (s: string) => tokens(s).join('');

interface Indexed {
  h: Hospital;
  words: string[];
  /** Name and aliases with spaces/punctuation removed — "aiimsjodhpur", "rgcirc". */
  keys: string[];
}

const INDEX: Indexed[] = HOSPITALS.map((h) => ({
  h,
  words: [...new Set(tokens([h.name, ...(h.aliases ?? []), h.city, h.state].join(' ')))],
  keys: [h.name, ...(h.aliases ?? [])].map(compact),
}));

/**
 * Hospitals matching what has been typed, best first. Every typed word must start a word of the
 * hospital's name, aliases, city or state ("aiims jod", "tata kol"), or the whole entry must start
 * an abbreviation ("rgci" → RGCIRC).
 */
export function suggestHospitals(query: string, limit = 8): Hospital[] {
  const q = tokens(query);
  if (q.length === 0) return [];
  const qc = q.join('');
  const scored: { h: Hospital; score: number; order: number }[] = [];
  INDEX.forEach((it, order) => {
    let score = 0;
    if (it.keys.some((k) => k === qc)) score = 5;
    else if (it.keys[0].startsWith(qc)) score = 4; // the standard name itself
    else if (it.keys.some((k) => k.startsWith(qc))) score = 3; // an alias
    else if (q.every((t) => it.words.some((w) => w.startsWith(t)))) score = q.length > 1 ? 2 : 1;
    if (score > 0) scored.push({ h: it.h, score, order });
  });
  // Ties keep directory order, which lists the major centres of each region first.
  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map((s) => s.h);
}

/** The directory entry whose name or an alias is exactly what was typed ("rgcirc", "AIIMS Jodhpur"). */
export function exactHospital(value: string): Hospital | undefined {
  const v = compact(value);
  if (!v) return undefined;
  const hits = INDEX.filter((it) => it.keys.includes(v));
  return hits.length === 1 ? hits[0].h : undefined;
}
