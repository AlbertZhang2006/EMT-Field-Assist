import express, { type Request, type Response } from 'express';
import { scoreSource, compareByScore, type ScoreInput } from './protocolSourceScoring.ts';
import { searchWeb, getActiveProvider, type WebSearchResult } from './webSearchAdapter.ts';
import {
  extractFromPastedText,
  extractFromPdfUrl,
  extractFromHtmlUrl,
  ExtractionError,
  type ExtractionResult,
} from './documentExtractionService.ts';
import { logSearchConfig } from './config.ts';

const app = express();
app.use(express.json());

// CORS — allow the Vite dev server origin
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// ============================================================
// Types (mirrors client types — keep in sync with src/types/index.ts)
// ============================================================

type SourceType = 'state_bureau' | 'regional_council' | 'county_agency' | 'bundled' | 'manual_import' | 'pasted_text';
type Confidence = 'high' | 'medium' | 'low';

interface SearchResult {
  id: string;
  regionName: string;
  state: string;
  agencyName: string;
  protocolTitle: string;
  sourceOrganization: string;
  sourceType: SourceType;
  sourceUrl: string | null;
  version: string;
  effectiveDate: string;
  lastCheckedAt: string | null;
  confidence: Confidence;
  protocolCount: number;
  notes: string;
}

interface ProtocolSection {
  id: string;
  name: string;
  category?: string;
  triggerKeywords: string[];
  inclusionCriteria?: string[];
  exclusionCriteria?: string[];
  assessmentItems?: string[];
  suggestedActions: string[];
  redFlags: string[];
  medicationNotes?: string[];
  medicalDirectionRequired?: string[];
  radioReportNeeds: string[];
  pcrDocumentationNeeds: string[];
  sourceExcerpt?: string;
  disclaimer: string;
  parseConfidence?: Confidence;
  needsReview?: boolean;
}

interface ImportedProtocol {
  id?: string;
  regionName: string;
  state?: string;
  agencyName?: string;
  sourceOrganization?: string;
  sourceType?: SourceType;
  sourceUrl?: string;
  sourceDocumentTitle?: string;
  version?: string;
  effectiveDate?: string;
  lastCheckedAt?: string;
  importedAt?: string;
  confidence?: Confidence;
  rawSourceText?: string;
  protocols: ProtocolSection[];
  parseWarnings?: string[];
}

// ============================================================
// Mock search index
//
// TODO: Replace with a real search backend. Options:
//   1. A curated database/JSON index of known official EMS protocol sources
//      (state bureaus, regional councils, county agencies) with metadata.
//   2. A web search API (Google Custom Search, Bing API) scoped to
//      official .gov / state EMS sites, with result ranking by source type.
//   3. A full-text search engine (MeiliSearch, Typesense) over a crawled
//      index of official protocol documents.
//
// Each result should point to a real sourceUrl so the import endpoint
// can fetch the actual document.
// ============================================================

const SEARCH_INDEX: SearchResult[] = [
  // --- State bureaus (high confidence) ---
  {
    id: 'ny-statewide',
    regionName: 'New York State',
    state: 'NY',
    agencyName: 'NYS Bureau of EMS',
    protocolTitle: 'New York Statewide BLS & ALS Protocols',
    sourceOrganization: 'NY Bureau of EMS (BEMS)',
    sourceType: 'state_bureau',
    sourceUrl: null, // TODO: real URL, e.g. https://www.health.ny.gov/professionals/ems/
    version: '2024.1',
    effectiveDate: '2024-04-01',
    lastCheckedAt: '2026-06-01',
    confidence: 'high',
    protocolCount: 42,
    notes: 'Complete statewide BLS and ALS treatment protocols including cardiac, medical, trauma, pediatric, and behavioral emergencies.',
  },
  {
    id: 'ma-statewide',
    regionName: 'Massachusetts',
    state: 'MA',
    agencyName: 'MA Office of EMS',
    protocolTitle: 'Massachusetts Statewide Treatment Protocols',
    sourceOrganization: 'MA Department of Public Health, Office of EMS',
    sourceType: 'state_bureau',
    sourceUrl: null, // TODO: real URL
    version: '7.0',
    effectiveDate: '2023-12-01',
    lastCheckedAt: '2026-06-01',
    confidence: 'high',
    protocolCount: 38,
    notes: 'Statewide pre-hospital treatment protocols for EMT, AEMT, and Paramedic levels.',
  },
  {
    id: 'ct-statewide',
    regionName: 'Connecticut',
    state: 'CT',
    agencyName: 'CT Office of EMS',
    protocolTitle: 'Connecticut Statewide EMS Protocols',
    sourceOrganization: 'CT Office of EMS',
    sourceType: 'state_bureau',
    sourceUrl: null, // TODO: real URL
    version: '2025.0',
    effectiveDate: '2025-01-01',
    lastCheckedAt: '2026-06-01',
    confidence: 'high',
    protocolCount: 35,
    notes: 'Statewide EMS protocols covering BLS and ALS operations, medical, trauma, obstetric, pediatric, and environmental emergencies.',
  },
  {
    id: 'pa-statewide',
    regionName: 'Pennsylvania',
    state: 'PA',
    agencyName: 'PA Bureau of EMS',
    protocolTitle: 'Pennsylvania Statewide BLS & ALS Protocols',
    sourceOrganization: 'PA Department of Health, Bureau of EMS',
    sourceType: 'state_bureau',
    sourceUrl: null, // TODO: real URL
    version: '2024.3',
    effectiveDate: '2024-09-01',
    lastCheckedAt: '2026-05-20',
    confidence: 'high',
    protocolCount: 40,
    notes: 'Statewide BLS and ALS treatment protocols with standing orders and pharmacology reference.',
  },
  {
    id: 'nj-statewide',
    regionName: 'New Jersey',
    state: 'NJ',
    agencyName: 'NJ Office of EMS',
    protocolTitle: 'New Jersey Statewide EMS Protocols',
    sourceOrganization: 'NJ Department of Health, Office of EMS',
    sourceType: 'state_bureau',
    sourceUrl: null, // TODO: real URL
    version: '2024.1',
    effectiveDate: '2024-01-01',
    lastCheckedAt: '2026-06-01',
    confidence: 'high',
    protocolCount: 36,
    notes: 'Statewide pre-hospital treatment protocols for BLS and ALS providers.',
  },
  {
    id: 'ca-statewide',
    regionName: 'California',
    state: 'CA',
    agencyName: 'CA EMSA',
    protocolTitle: 'California EMSA Model Treatment Guidelines',
    sourceOrganization: 'CA Emergency Medical Services Authority',
    sourceType: 'state_bureau',
    sourceUrl: null, // TODO: real URL
    version: '2023.2',
    effectiveDate: '2023-07-01',
    lastCheckedAt: '2026-04-15',
    confidence: 'high',
    protocolCount: 44,
    notes: 'State model guidelines. Individual LEMSAs may adopt with modifications.',
  },
  {
    id: 'tx-statewide',
    regionName: 'Texas',
    state: 'TX',
    agencyName: 'TX DSHS Office of EMS',
    protocolTitle: 'Texas EMS Clinical Practice Guidelines',
    sourceOrganization: 'TX Department of State Health Services',
    sourceType: 'state_bureau',
    sourceUrl: null, // TODO: real URL
    version: '2024.0',
    effectiveDate: '2024-06-01',
    lastCheckedAt: '2026-05-01',
    confidence: 'high',
    protocolCount: 48,
    notes: 'Statewide clinical practice guidelines for EMS. Advisory — local medical directors may modify.',
  },
  // --- Regional / county (medium confidence) ---
  {
    id: 'nys-westchester',
    regionName: 'Westchester County REMSCO',
    state: 'NY',
    agencyName: 'Westchester REMSCO',
    protocolTitle: 'Westchester Regional EMS Protocols',
    sourceOrganization: 'Westchester REMSCO',
    sourceType: 'regional_council',
    sourceUrl: null, // TODO: real URL
    version: '2024.2',
    effectiveDate: '2024-07-01',
    lastCheckedAt: '2026-05-15',
    confidence: 'medium',
    protocolCount: 28,
    notes: 'Regional protocols supplementing NY State with county-specific standing orders and destination policies.',
  },
  {
    id: 'ca-la-county',
    regionName: 'Los Angeles County',
    state: 'CA',
    agencyName: 'LA County DHS EMS Agency',
    protocolTitle: 'LA County EMS Treatment Guidelines',
    sourceOrganization: 'LA County DHS EMS Agency',
    sourceType: 'county_agency',
    sourceUrl: null, // TODO: real URL
    version: '2024-R1',
    effectiveDate: '2024-03-15',
    lastCheckedAt: '2026-04-20',
    confidence: 'medium',
    protocolCount: 45,
    notes: 'County-level EMS protocols including scope of practice, treatment guidelines, and base hospital contact procedures.',
  },
  {
    id: 'il-chicago',
    regionName: 'Chicago / Region XI',
    state: 'IL',
    agencyName: 'Chicago EMS System',
    protocolTitle: 'Region XI EMS System Protocols',
    sourceOrganization: 'Chicago OEMS, Region XI',
    sourceType: 'regional_council',
    sourceUrl: null, // TODO: real URL
    version: '2024.1',
    effectiveDate: '2024-02-01',
    lastCheckedAt: '2026-05-10',
    confidence: 'medium',
    protocolCount: 33,
    notes: 'Regional EMS system protocols for the Chicago metropolitan area.',
  },
];

// --- Curated index search ---

function searchCuratedIndex(query: string): SearchResult[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  return SEARCH_INDEX.filter((r) =>
    r.regionName.toLowerCase().includes(q) ||
    r.state.toLowerCase().includes(q) ||
    r.protocolTitle.toLowerCase().includes(q) ||
    r.sourceOrganization.toLowerCase().includes(q) ||
    r.agencyName.toLowerCase().includes(q) ||
    r.notes.toLowerCase().includes(q)
  );
}

// --- Convert raw web results to SearchResult shape ---

const US_STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY',
};

const STATE_ABBREV_RE = /\b([A-Z]{2})\b/;

function extractState(text: string): string {
  for (const [name, abbr] of Object.entries(US_STATES)) {
    if (text.toLowerCase().includes(name)) return abbr;
  }
  const m = text.match(STATE_ABBREV_RE);
  if (m && Object.values(US_STATES).includes(m[1])) return m[1];
  return '';
}

function extractOrg(title: string): string {
  const dash = title.split(/\s*[—–\-|]\s*/);
  return dash.length > 1 ? dash[dash.length - 1].trim() : '';
}

function extractRegion(title: string, state: string): string {
  const dash = title.split(/\s*[—–\-|]\s*/);
  const main = dash[0].trim();
  if (state) {
    const stateName = Object.entries(US_STATES).find(([, a]) => a === state)?.[0];
    if (stateName) return stateName.charAt(0).toUpperCase() + stateName.slice(1);
  }
  return main;
}

function webResultToSearchResult(web: WebSearchResult, index: number): SearchResult {
  const state = extractState(web.title + ' ' + web.snippet);
  const org = extractOrg(web.title);

  return {
    id: `web-${index}-${encodeURIComponent(web.url).slice(0, 40)}`,
    regionName: extractRegion(web.title, state),
    state,
    agencyName: org || 'Unknown',
    protocolTitle: web.title,
    sourceOrganization: org || 'Unknown',
    sourceType: 'manual_import',
    sourceUrl: web.url,
    version: '',
    effectiveDate: '',
    lastCheckedAt: null,
    confidence: 'low',
    protocolCount: 0,
    notes: web.snippet,
  };
}

// --- Merge, deduplicate, score, rank ---

function mergeAndRank(curated: SearchResult[], webResults: SearchResult[]): SearchResult[] {
  const seen = new Set(curated.map((r) => r.id));
  const curatedUrls = new Set(
    curated.map((r) => r.sourceUrl).filter((u): u is string => u !== null),
  );

  const deduped = webResults.filter((r) => {
    if (seen.has(r.id)) return false;
    if (r.sourceUrl && curatedUrls.has(r.sourceUrl)) return false;
    seen.add(r.id);
    return true;
  });

  const all = [...curated, ...deduped];

  const scored = all.map((r) => {
    const input: ScoreInput = {
      sourceUrl: r.sourceUrl,
      sourceOrganization: r.sourceOrganization,
      sourceType: r.sourceType,
      version: r.version,
      effectiveDate: r.effectiveDate,
      lastCheckedAt: r.lastCheckedAt,
      protocolTitle: r.protocolTitle,
      regionName: r.regionName,
      notes: r.notes,
    };
    const result = scoreSource(input);
    return { entry: { ...r, confidence: result.confidence }, score: result };
  });

  scored.sort((a, b) => compareByScore(a.score, b.score));
  return scored.map((s) => s.entry);
}

// ============================================================
// GET /protocol-search?q=
// ============================================================

app.get('/protocol-search', async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';

  if (!q.trim()) {
    res.json({ results: [] });
    return;
  }

  const curated = searchCuratedIndex(q);

  let webConverted: SearchResult[] = [];
  try {
    const webRaw = await searchWeb(q);
    webConverted = webRaw.map(webResultToSearchResult);
  } catch (err) {
    console.warn('Web search failed, serving curated results only:', err);
  }

  const results = mergeAndRank(curated, webConverted);

  res.json({
    results,
    meta: { provider: getActiveProvider(), curatedCount: curated.length, webCount: webConverted.length },
  });
});

// ============================================================
// Protocol import — mock content generator
//
// TODO: Replace this entire section with real document processing:
//
//   1. FETCH: Download the PDF or HTML page from result.sourceUrl
//      - Use a fetch library (node-fetch, undici) for HTML pages
//      - Use a headless browser (Playwright) for JS-rendered pages
//      - Respect robots.txt and rate-limit requests
//
//   2. EXTRACT TEXT:
//      - For PDF: use pdf-parse, pdfjs-dist, or a cloud OCR API
//        (Google Document AI, AWS Textract) for scanned documents
//      - For HTML: use cheerio or JSDOM to extract main content,
//        strip navigation/headers/footers
//
//   3. PARSE INTO SECTIONS:
//      - Rule-based: regex patterns for headings, numbered steps,
//        medication tables, dosage blocks
//      - LLM-assisted: send extracted text to Claude with a prompt
//        that returns structured ProtocolSection JSON
//      - Hybrid: rule-based extraction with LLM cleanup/enrichment
//
//   4. VALIDATE & RETURN:
//      - Ensure every section has triggerKeywords and suggestedActions
//      - Mark sections where parsing was uncertain (needsReview)
//      - Set confidence based on source authority + parse quality
//      - Return the ImportedProtocol to the client
// ============================================================

function buildMockProtocol(body: ImportBody): ImportedProtocol {
  const region = body.regionName;
  const sections = buildMockSections(region);

  const { confidence } = scoreSource({
    sourceUrl: body.sourceUrl,
    sourceOrganization: body.sourceOrganization,
    protocolTitle: body.protocolTitle,
    regionName: body.regionName,
  });

  return {
    id: `imported-${region.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    regionName: region,
    state: body.state,
    sourceOrganization: body.sourceOrganization,
    sourceUrl: body.sourceUrl ?? undefined,
    sourceDocumentTitle: body.protocolTitle,
    version: 'mock-1.0',
    effectiveDate: '2024-01-01',
    lastCheckedAt: new Date().toISOString().slice(0, 10),
    importedAt: new Date().toISOString(),
    confidence,
    protocols: sections,
    parseWarnings: [
      'Protocol content is generated from mock data — does not represent actual clinical protocols.',
    ],
  };
}

function buildMockSections(region: string): ProtocolSection[] {
  return [
    {
      id: 'chest-pain',
      name: 'Chest Pain / ACS',
      category: 'Cardiac',
      triggerKeywords: ['chest pain', 'chest tightness', 'substernal', 'crushing', 'pressure in chest', 'angina', 'heart attack', 'acs'],
      assessmentItems: [
        'OPQRST characterization',
        '12-lead ECG',
        'SpO2',
        'Blood pressure both arms if dissection suspected',
        'Lung sounds',
      ],
      suggestedActions: [
        `Consider 12-lead ECG if available — verify per ${region} protocol.`,
        `Consider aspirin 324 mg PO if no contraindications — verify per ${region} protocol.`,
        'Consider IV access and normal saline TKO.',
        `Consider nitroglycerin if SBP > 100 — verify per ${region} protocol and medical direction.`,
        'Monitor SpO2; consider O2 if < 94%.',
      ],
      redFlags: [
        'SBP < 90 or signs of cardiogenic shock — contact medical direction immediately.',
        `New ST elevation on 12-lead — consider STEMI alert per ${region} protocol.`,
        'Tearing pain radiating to back — consider aortic dissection, avoid anticoagulants.',
      ],
      medicationNotes: [
        'Aspirin 324 mg PO — verify no allergy, no active GI bleed.',
        `Nitroglycerin 0.4 mg SL — verify SBP > 100, no recent PDE5 inhibitor use. Contact medical direction if required.`,
      ],
      medicalDirectionRequired: [
        'Nitroglycerin administration if SBP borderline',
        'STEMI alert activation',
        'Pain management beyond aspirin',
      ],
      radioReportNeeds: ['Age, sex', 'Chief complaint and onset time', 'Pain description (OPQRST)', 'Vitals with trending', '12-lead interpretation if obtained', 'Treatments given and response', 'ETA'],
      pcrDocumentationNeeds: ['Detailed OPQRST', 'SAMPLE history', 'Serial vitals (minimum two sets)', 'All interventions with timestamps', '12-lead findings', 'Patient response to each treatment'],
      disclaimer: `Mock protocol for ${region}. Verify all actions per your actual local protocol. Advisory guidance only.`,
      parseConfidence: 'medium',
      needsReview: false,
    },
    {
      id: 'respiratory-distress',
      name: 'Respiratory Distress',
      category: 'Respiratory',
      triggerKeywords: ['shortness of breath', 'dyspnea', 'difficulty breathing', 'wheezing', 'asthma', 'copd', 'respiratory distress'],
      assessmentItems: [
        'SpO2 and respiratory rate',
        'Lung sounds bilaterally',
        'Accessory muscle use',
        'Ability to speak in full sentences',
        'Pedal edema or JVD',
      ],
      suggestedActions: [
        `Consider O2 to maintain SpO2 > 94% — verify per ${region} protocol.`,
        `Consider nebulized albuterol for bronchospasm — verify per ${region} protocol.`,
        `Consider CPAP if available and indicated — verify per ${region} protocol.`,
        'Position of comfort; consider sitting upright.',
      ],
      redFlags: [
        'SpO2 < 90% despite O2 — consider advanced airway, contact medical direction.',
        'Silent chest with severe distress — impending respiratory failure.',
        'Altered mental status with respiratory distress — immediate intervention needed.',
      ],
      medicationNotes: [
        `Albuterol 2.5 mg nebulized — verify per ${region} protocol.`,
      ],
      medicalDirectionRequired: [
        'CPAP initiation',
        'Advanced airway management',
      ],
      radioReportNeeds: ['Age, sex', 'Chief complaint and onset', 'SpO2 and respiratory rate', 'Lung sounds', 'Treatments given and response', 'ETA'],
      pcrDocumentationNeeds: ['Onset and progression', 'Lung sounds before and after treatment', 'Serial SpO2 and respiratory rate', 'All medications with times', 'SAMPLE history'],
      disclaimer: `Mock protocol for ${region}. Verify all actions per your actual local protocol. Advisory guidance only.`,
      parseConfidence: 'medium',
      needsReview: false,
    },
    {
      id: 'trauma',
      name: 'Trauma / Injury',
      category: 'Trauma',
      triggerKeywords: ['trauma', 'fall', 'accident', 'mva', 'mvc', 'crash', 'gunshot', 'gsw', 'stabbing', 'fracture', 'bleeding', 'laceration', 'injury'],
      assessmentItems: [
        'Mechanism of injury',
        'Primary survey (ABCDE)',
        'GCS',
        'Hemorrhage control assessment',
        'Spinal motion restriction consideration',
      ],
      suggestedActions: [
        'Consider primary survey: ABCDE — address life threats first.',
        `Consider direct pressure for hemorrhage; consider tourniquet if needed — verify per ${region} protocol.`,
        `Consider spinal motion restriction if mechanism suggests — verify per ${region} protocol.`,
        'Consider IV access with normal saline; titrate to SBP > 90.',
        `Consider rapid transport if trauma center criteria met — verify per ${region} protocol.`,
      ],
      redFlags: [
        'Uncontrolled hemorrhage — apply tourniquet, contact medical direction.',
        'Signs of tension pneumothorax — consider needle decompression per protocol.',
        'GCS < 9 with trauma — manage airway, consider trauma center.',
      ],
      medicalDirectionRequired: [
        'Needle decompression',
        'TXA administration',
        'Trauma center bypass decisions',
      ],
      radioReportNeeds: ['Age, sex', 'Mechanism of injury', 'Injuries found', 'GCS', 'Vitals with trending', 'Hemorrhage control measures', 'ETA to trauma center'],
      pcrDocumentationNeeds: ['Detailed mechanism of injury', 'Primary and secondary survey findings', 'GCS with components', 'All hemorrhage control measures with times', 'Serial vitals', 'Transport decision rationale'],
      disclaimer: `Mock protocol for ${region}. Verify all actions per your actual local protocol. Advisory guidance only.`,
      parseConfidence: 'medium',
      needsReview: false,
    },
    {
      id: 'altered-mental-status',
      name: 'Altered Mental Status',
      category: 'Neurological',
      triggerKeywords: ['altered mental status', 'confused', 'unresponsive', 'unconscious', 'lethargic', 'ams', 'syncope', 'seizure', 'postictal'],
      assessmentItems: [
        'GCS score',
        'Blood glucose level',
        'Pupil size and reactivity',
        'Onset / last known normal time',
        'Signs of trauma',
      ],
      suggestedActions: [
        `Consider blood glucose check — treat hypoglycemia per ${region} protocol.`,
        `Consider naloxone if opioid overdose suspected — verify per ${region} protocol.`,
        'Protect airway; consider recovery position if no trauma suspected.',
        `Consider stroke scale assessment — verify per ${region} protocol.`,
        'Establish IV access.',
      ],
      redFlags: [
        'GCS <= 8 — consider advanced airway management, contact medical direction.',
        'Blood glucose < 60 with AMS — administer dextrose per protocol.',
        'Unilateral findings — activate stroke alert per regional protocol.',
      ],
      medicalDirectionRequired: [
        'Advanced airway management',
        'Repeated naloxone doses',
      ],
      radioReportNeeds: ['Age, sex', 'GCS and mental status description', 'Blood glucose', 'Onset or last known normal', 'Treatments given and response', 'ETA'],
      pcrDocumentationNeeds: ['Detailed GCS with components', 'Blood glucose with time', 'Pupil findings', 'Last known normal time', 'All interventions with timestamps'],
      disclaimer: `Mock protocol for ${region}. Verify all actions per your actual local protocol. Advisory guidance only.`,
      parseConfidence: 'medium',
      needsReview: false,
    },
    {
      id: 'allergic-reaction',
      name: 'Allergic Reaction / Anaphylaxis',
      category: 'Medical',
      triggerKeywords: ['allergic reaction', 'anaphylaxis', 'hives', 'swelling', 'bee sting', 'epipen', 'rash', 'itching', 'angioedema'],
      assessmentItems: [
        'Airway patency',
        'Respiratory status — stridor, wheezing',
        'Skin — hives, flushing, angioedema',
        'Hemodynamic status',
        'Allergen exposure history',
      ],
      suggestedActions: [
        `Consider epinephrine 0.3 mg IM for anaphylaxis — verify per ${region} protocol.`,
        'Remove allergen source if possible.',
        `Consider diphenhydramine if available — verify per ${region} protocol.`,
        'Consider IV fluid bolus for hypotension.',
        'Monitor airway closely for progressive swelling.',
      ],
      redFlags: [
        'Stridor or tongue swelling — impending airway obstruction, expedite transport.',
        'Hypotension with anaphylaxis — consider repeat epinephrine, contact medical direction.',
        'Biphasic reaction possible — monitor after initial improvement.',
      ],
      medicationNotes: [
        `Epinephrine 0.3 mg IM (adult) — verify per ${region} protocol. May repeat per medical direction.`,
      ],
      medicalDirectionRequired: [
        'Repeat epinephrine doses',
        'IV epinephrine for refractory anaphylaxis',
      ],
      radioReportNeeds: ['Age, sex', 'Allergen and exposure time', 'Symptoms — airway, breathing, skin, hemodynamic', 'Treatments given and response', 'ETA'],
      pcrDocumentationNeeds: ['Allergen identification', 'Symptom progression', 'All medications with times and routes', 'Serial vitals', 'Airway status throughout transport'],
      disclaimer: `Mock protocol for ${region}. Verify all actions per your actual local protocol. Advisory guidance only.`,
      parseConfidence: 'medium',
      needsReview: false,
    },
  ];
}

// ============================================================
// POST /protocol-import
// ============================================================

interface ImportBody {
  sourceUrl?: string;
  sourceOrganization: string;
  regionName: string;
  state: string;
  protocolTitle: string;
}

function isValidImportBody(body: unknown): body is ImportBody {
  if (body == null || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.regionName === 'string' && b.regionName.length > 0 &&
    typeof b.sourceOrganization === 'string' &&
    typeof b.state === 'string' &&
    typeof b.protocolTitle === 'string'
  );
}

app.post('/protocol-import', async (req: Request, res: Response) => {
  if (!isValidImportBody(req.body)) {
    res.status(400).json({ error: 'Missing required fields: regionName, sourceOrganization, state, protocolTitle' });
    return;
  }

  const body: ImportBody = req.body;

  // TODO: Replace this entire block with real document processing:
  //
  // if (body.sourceUrl) {
  //   // 1. Fetch the document
  //   const doc = await fetchDocument(body.sourceUrl);
  //
  //   // 2. Extract text
  //   let rawText: string;
  //   if (doc.contentType === 'application/pdf') {
  //     rawText = await extractTextFromPDF(doc.buffer);
  //   } else {
  //     rawText = await extractTextFromHTML(doc.html);
  //   }
  //
  //   // 3. Parse into structured sections
  //   const sections = await parseProtocolText(rawText, {
  //     regionName: body.regionName,
  //     state: body.state,
  //   });
  //
  //   // 4. Build and return ImportedProtocol
  //   const protocol = buildImportedProtocol(body, sections, rawText);
  //   return res.json({ importedProtocol: protocol });
  // }

  // Mock: simulate processing delay
  await new Promise((r) => setTimeout(r, 500));

  const protocol = buildMockProtocol(body);
  res.json({ importedProtocol: protocol });
});

// ============================================================
// POST /protocol-extract
//
// Extracts raw text and metadata from a document source.
// Supports: pasted text (fully implemented), PDF URL, HTML URL (mock).
// ============================================================

interface ExtractBody {
  text?: string;
  url?: string;
  format?: 'pdf' | 'html' | 'auto';
}

function isValidExtractBody(body: unknown): body is ExtractBody {
  if (body == null || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (typeof b.text === 'string' && b.text.trim().length > 0) ||
         (typeof b.url === 'string' && b.url.trim().length > 0);
}

function detectUrlFormat(url: string): 'pdf' | 'html' {
  if (/\.pdf($|\?)/i.test(url)) return 'pdf';
  return 'html';
}

app.post('/protocol-extract', async (req: Request, res: Response) => {
  if (!isValidExtractBody(req.body)) {
    res.status(400).json({ error: 'Provide either "text" or "url" in request body.' });
    return;
  }

  const body: ExtractBody = req.body;

  try {
    let result: ExtractionResult;

    if (body.text) {
      result = extractFromPastedText(body.text);
    } else if (body.url) {
      const format = body.format === 'pdf' || body.format === 'html'
        ? body.format
        : detectUrlFormat(body.url);

      if (format === 'pdf') {
        result = await extractFromPdfUrl(body.url);
      } else {
        result = await extractFromHtmlUrl(body.url);
      }
    } else {
      res.status(400).json({ error: 'Provide either "text" or "url".' });
      return;
    }

    res.json({ extraction: result });
  } catch (err) {
    if (err instanceof ExtractionError) {
      res.status(422).json({ error: err.userMessage });
      return;
    }
    console.error('Extraction failed:', err);
    res.status(500).json({ error: 'Document extraction failed. Please try again.' });
  }
});

// ============================================================
// Start
// ============================================================

const PORT = parseInt(process.env.PORT ?? '3001', 10);

app.listen(PORT, () => {
  console.log(`Protocol API running on http://localhost:${PORT}`);
  console.log(`  GET  http://localhost:${PORT}/protocol-search?q=new+york`);
  console.log(`  POST http://localhost:${PORT}/protocol-import`);
  console.log(`  POST http://localhost:${PORT}/protocol-extract`);
  logSearchConfig();
});
