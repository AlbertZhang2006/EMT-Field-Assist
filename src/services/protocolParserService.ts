import type { ProtocolSection, ImportedProtocol, SourceType, Confidence } from '../types/index';

// --- Service interface ---
//
// protocolParserService.parse(rawText, metadata) → ParseResult
//
// Converts raw protocol text into structured ProtocolSection items.
//
// Current implementation: local rule-based parsing with category detection,
// keyword extraction, and advisory-language enforcement.
//
// Future upgrade path:
//   - A backend or serverless function could run heavier NLP / LLM parsing
//     on the extracted text before returning it to the client.
//   - The backend would call this same parse() interface, but with richer
//     extraction logic (e.g., medication dosage tables, inclusion/exclusion
//     criteria, flowchart steps).
//   - The client keeps calling parse() the same way — only the
//     implementation changes.
//
// TODO: When server-side parsing is available, add a flag to ParseInput
// (e.g., `serverParsed?: boolean`) so the client knows whether the result
// came from the local rule engine or from a backend with higher fidelity.

export interface ParseInput {
  rawText: string;
  regionName: string;
  state?: string;
  sourceOrganization?: string;
  version?: string;
  effectiveDate?: string;
  sourceUrl?: string;
  sourceType?: SourceType;
  confidence?: Confidence;
}

export interface ParseStats {
  sectionsDetected: number;
  sectionsNeedingReview: number;
  categoriesMatched: string[];
}

export interface ParseResult {
  protocol: ImportedProtocol;
  stats: ParseStats;
  warnings: string[];
}

// Canonical entry point — matches the service interface name.
export function parse(input: ParseInput): ParseResult {
  return parseProtocolText(input);
}

export function parseProtocolText(input: ParseInput): ParseResult {
  const rawSections = splitIntoSections(input.rawText);
  const parsed: ProtocolSection[] = [];
  const categoriesMatched = new Set<string>();
  let needsReviewCount = 0;

  if (rawSections.length === 0) {
    parsed.push(buildFallbackSection(input.rawText, input.regionName));
    needsReviewCount = 1;
  } else {
    for (const section of rawSections) {
      const result = parseOneSection(section);
      parsed.push(result.section);
      if (result.category) categoriesMatched.add(result.category);
      if (result.needsReview) needsReviewCount++;
    }
  }

  const warnings = generateParseWarnings(input, parsed, needsReviewCount, categoriesMatched);

  return {
    protocol: {
      regionName: input.regionName,
      state: input.state,
      sourceOrganization: input.sourceOrganization,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl,
      version: input.version ?? 'draft',
      effectiveDate: input.effectiveDate,
      importedAt: new Date().toISOString(),
      confidence: input.confidence ?? 'low',
      rawSourceText: input.rawText,
      protocols: parsed,
      parseWarnings: warnings.length > 0 ? warnings : undefined,
    },
    stats: {
      sectionsDetected: parsed.length,
      sectionsNeedingReview: needsReviewCount,
      categoriesMatched: [...categoriesMatched],
    },
    warnings,
  };
}

// --- Category templates ---

interface CategoryTemplate {
  category: string;
  defaultName: string;
  detect: RegExp[];
  keywords: string[];
  assessmentHints: string[];
  radioNeeds: string[];
  pcrNeeds: string[];
}

const KNOWN_CATEGORIES: CategoryTemplate[] = [
  {
    category: 'Cardiac',
    defaultName: 'Chest Pain / ACS',
    detect: [/chest\s*pain/i, /\bacs\b/i, /acute\s*coronary/i, /\bstemi\b/i, /\bnstemi\b/i, /cardiac(?!\s*arrest)/i, /heart\s*attack/i, /\bangina\b/i, /myocardial/i],
    keywords: ['chest pain', 'chest tightness', 'cardiac', 'acs', 'heart attack', 'angina', 'stemi'],
    assessmentHints: ['OPQRST', '12-lead ECG', 'SpO2', 'Blood pressure both arms', 'Lung sounds'],
    radioNeeds: ['Age/sex', 'Onset and duration', 'Pain character', 'Vitals', 'ECG findings', 'Treatments and response', 'ETA'],
    pcrNeeds: ['Pain assessment with OPQRST', 'Serial vitals', 'ECG interpretation', 'Intervention times'],
  },
  {
    category: 'Respiratory',
    defaultName: 'Respiratory Distress',
    detect: [/respiratory/i, /shortness\s*of\s*breath/i, /\bsob\b/i, /\bcopd\b/i, /\basthma\b/i, /dyspnea/i, /breathing\s*(?:difficult|problem)/i, /\bwheezing\b/i, /pulmonary\s*edema/i],
    keywords: ['shortness of breath', 'difficulty breathing', 'respiratory distress', 'copd', 'asthma', 'wheezing', 'dyspnea'],
    assessmentHints: ['Lung sounds', 'SpO2', 'Respiratory rate', 'Work of breathing', 'OPQRST'],
    radioNeeds: ['Age/sex', 'Chief complaint', 'Lung sounds', 'SpO2', 'Respiratory rate', 'Treatments and response', 'ETA'],
    pcrNeeds: ['Lung sound findings', 'SpO2 trend', 'Respiratory effort', 'Intervention details'],
  },
  {
    category: 'Neurological',
    defaultName: 'Stroke / CVA',
    detect: [/\bstroke\b/i, /\bcva\b/i, /\btia\b/i, /cerebrovascular/i, /facial\s*droop/i, /arm\s*drift/i, /slurred\s*speech/i],
    keywords: ['stroke', 'cva', 'tia', 'facial droop', 'arm drift', 'slurred speech', 'weakness'],
    assessmentHints: ['Cincinnati Stroke Scale / FAST', 'Blood glucose', 'Time of onset / last known well', 'GCS', 'Blood pressure'],
    radioNeeds: ['Age/sex', 'Time of symptom onset', 'FAST findings', 'Blood glucose', 'Vitals', 'ETA'],
    pcrNeeds: ['Stroke scale findings', 'Time of onset', 'Neurological baseline', 'Blood glucose', 'Serial vitals'],
  },
  {
    category: 'Altered Mental Status',
    defaultName: 'Altered Mental Status',
    detect: [/altered\s*mental/i, /\bams\b/i, /unresponsive/i, /\bsyncope\b/i, /\bseizure/i, /unconscious/i, /confusion/i, /overdose/i, /intoxicat/i],
    keywords: ['altered mental status', 'ams', 'unresponsive', 'syncope', 'seizure', 'confusion', 'overdose'],
    assessmentHints: ['GCS', 'Blood glucose', 'Pupil response', 'AVPU', 'SAMPLE history'],
    radioNeeds: ['Age/sex', 'Level of consciousness', 'Blood glucose', 'Suspected cause', 'Vitals', 'ETA'],
    pcrNeeds: ['GCS trending', 'Blood glucose', 'Neurological findings', 'Scene findings', 'Intervention response'],
  },
  {
    category: 'Trauma',
    defaultName: 'Trauma',
    detect: [/\btrauma\b/i, /\bfall\b/i, /\bmvc\b/i, /\bmva\b/i, /motor\s*vehicle/i, /\bgsw\b/i, /gunshot/i, /\bstab/i, /penetrat/i, /\bfracture/i, /blunt\s*force/i],
    keywords: ['trauma', 'fall', 'mvc', 'mva', 'injury', 'bleeding', 'fracture', 'gsw'],
    assessmentHints: ['Mechanism of injury', 'Primary survey ABCDE', 'Hemorrhage control', 'GCS', 'Spinal motion restriction assessment'],
    radioNeeds: ['Age/sex', 'Mechanism of injury', 'Injuries found', 'Vitals', 'Interventions', 'ETA', 'Trauma alert criteria'],
    pcrNeeds: ['Mechanism details', 'Primary and secondary survey findings', 'Hemorrhage control measures', 'Spinal precautions'],
  },
  {
    category: 'Allergic Reaction',
    defaultName: 'Allergic Reaction / Anaphylaxis',
    detect: [/allerg/i, /anaphyla/i, /\bhives\b/i, /urticaria/i, /epinephrine\s*auto/i, /\bepi[\s-]*pen/i],
    keywords: ['allergic reaction', 'anaphylaxis', 'hives', 'swelling', 'epinephrine', 'epipen'],
    assessmentHints: ['Airway patency', 'Breathing adequacy', 'Skin assessment', 'Allergen identification', 'SpO2', 'Blood pressure'],
    radioNeeds: ['Age/sex', 'Allergen if known', 'Symptoms', 'Airway status', 'Vitals', 'Treatments and response', 'ETA'],
    pcrNeeds: ['Allergen identified', 'Onset and progression', 'Airway assessment', 'Epinephrine details', 'Response to treatment'],
  },
];

// --- Line classification patterns ---

const ACTION_RE = /^(?:consider|administer|give|push|apply|start|initiate|perform|obtain|establish|maintain|provide|assist|prepare|transport|immobilize|splint|irrigate|suction|ventilate|defibrillate|cardiovert|infuse|titrate|place|insert|attach|connect|open|clear|elevate|position|begin|continue|repeat|if\s)/i;

const ASSESSMENT_RE = /^(?:assess|evaluate|check|monitor|measure|auscultate|palpate|inspect|observe|examine|determine|identify|document|note|record|obtain\s+(?:vitals|history|12.?lead|ecg|glucose|spo2))/i;

const RED_FLAG_RE = /(?:red\s*flag|warning|caution|immediately|emergent|life[\s-]*threaten|critical|arrest|unresponsive|apneic|pulseless|agonal|decompensating|lethal|contraindic)/i;

const MEDICATION_RE = /\b(?:\d+\s*(?:mg|mcg|ml|g|units?|meq)\b|aspirin|nitroglycerin|ntg|albuterol|epinephrine|narcan|naloxone|glucose|dextrose|atropine|amiodarone|lidocaine|adenosine|diphenhydramine|benadryl|glucagon|morphine|fentanyl|midazolam|diazepam|methylprednisolone|magnesium|ipratropium|ondansetron|zofran|ketamine|rocuronium|succinylcholine)\b/i;

// --- Section splitting ---

interface RawSection {
  heading: string;
  body: string;
  raw: string;
}

function isHeadingLine(line: string): boolean {
  if (!line || line.length > 80) return false;
  if (/^#{1,3}\s/.test(line)) return true;
  const stripped = line.replace(/[:\-–—]+$/, '').trim();
  if (stripped.length >= 3 && stripped.length <= 60 && /^[A-Z][A-Z\s\-\/&()0-9]+$/.test(stripped)) return true;
  if (/^\d+[\.\)]\s+[A-Z]/.test(line) && line.length <= 60) return true;
  return false;
}

function splitIntoSections(text: string): RawSection[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const blocks = trimmed.split(/\n{2,}/).filter(b => b.trim());
  if (blocks.length === 0) return [];

  const raw: RawSection[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const first = lines[0];
    const isHead = isHeadingLine(first) || (first.length <= 60 && lines.length > 1 && !first.startsWith('-') && !first.startsWith('*'));

    const heading = isHead
      ? first.replace(/^#{1,3}\s*/, '').replace(/^\d+[\.\)]\s*/, '').replace(/[:\-–—]+$/, '').trim()
      : '';
    const bodyLines = isHead ? lines.slice(1) : lines;

    raw.push({
      heading,
      body: bodyLines.join('\n'),
      raw: block.trim(),
    });
  }

  // Merge heading-only blocks with the next block
  const merged: RawSection[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].heading && !raw[i].body && i + 1 < raw.length) {
      merged.push({
        heading: raw[i].heading,
        body: raw[i + 1].body || raw[i + 1].heading,
        raw: raw[i].raw + '\n\n' + raw[i + 1].raw,
      });
      i++;
    } else {
      merged.push(raw[i]);
    }
  }

  return merged.filter(s => s.heading || s.body);
}

// --- Content extraction ---

interface ExtractedContent {
  actions: string[];
  assessments: string[];
  redFlags: string[];
  medications: string[];
  unclassified: string[];
}

function extractContent(body: string): ExtractedContent {
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  const actions: string[] = [];
  const assessments: string[] = [];
  const redFlags: string[] = [];
  const medications: string[] = [];
  const unclassified: string[] = [];

  for (const raw of lines) {
    const line = raw.replace(/^[-•*]\s*/, '').trim();
    if (!line) continue;
    const isBulleted = /^[-•*]\s/.test(raw);

    if (RED_FLAG_RE.test(line)) {
      redFlags.push(line);
    } else if (MEDICATION_RE.test(line) && (isBulleted || ACTION_RE.test(line))) {
      medications.push(line);
      actions.push(ensureAdvisory(line));
    } else if (ASSESSMENT_RE.test(line)) {
      assessments.push(line);
    } else if (ACTION_RE.test(line) || isBulleted) {
      actions.push(ensureAdvisory(line));
    } else {
      unclassified.push(line);
    }
  }

  return { actions, assessments, redFlags, medications, unclassified };
}

function ensureAdvisory(text: string): string {
  if (/^(?:consider|verify|contact|document|reassess|if\s)/i.test(text)) return text;
  if (/^(?:administer|give|push|start|initiate|perform|apply)\b/i.test(text)) {
    return `Consider: ${text} — verify per local protocol`;
  }
  if (/^(?:assess|evaluate|check|monitor|obtain|measure)\b/i.test(text)) return text;
  return text;
}

// --- Section building ---

function matchCategory(heading: string, body: string): CategoryTemplate | null {
  const combined = `${heading}\n${body}`;
  for (const cat of KNOWN_CATEGORIES) {
    if (cat.detect.some(re => re.test(combined))) return cat;
  }
  return null;
}

function toSlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

interface SectionResult {
  section: ProtocolSection;
  category: string | null;
  needsReview: boolean;
}

function parseOneSection(raw: RawSection): SectionResult {
  const category = matchCategory(raw.heading, raw.body);
  const content = extractContent(raw.body);

  const name = raw.heading || category?.defaultName || 'General Protocol';
  const hasActions = content.actions.length > 0;
  const needsReview = !category || !hasActions;

  let parseConfidence: 'high' | 'medium' | 'low';
  if (category && hasActions && content.assessments.length > 0) {
    parseConfidence = 'high';
  } else if (category || hasActions) {
    parseConfidence = 'medium';
  } else {
    parseConfidence = 'low';
  }

  const keywords: string[] = category
    ? [...category.keywords]
    : extractKeywordsFromHeading(raw.heading);

  // Add keywords from heading that aren't already covered
  if (category) {
    for (const kw of extractKeywordsFromHeading(raw.heading)) {
      if (!keywords.some(k => k.toLowerCase() === kw.toLowerCase())) {
        keywords.push(kw);
      }
    }
  }

  const assessmentItems = content.assessments.length > 0
    ? content.assessments
    : category?.assessmentHints;

  const radioNeeds = category?.radioNeeds ?? [];
  const pcrNeeds = category?.pcrNeeds ?? [];

  let disclaimer: string;
  if (!category && !hasActions) {
    disclaimer = 'Needs review — could not parse structured guidance from this section. Verify all content per local protocol.';
  } else if (!category) {
    disclaimer = 'Needs review — category not matched. Verify section content against your local protocol.';
  } else if (!hasActions) {
    disclaimer = 'Needs review — no structured guidance extracted. Review source text and verify per local protocol.';
  } else {
    disclaimer = 'Parsed from pasted text. Verify all actions per local protocol and medical direction.';
  }

  return {
    section: {
      id: toSlug(name),
      name,
      category: category?.category,
      triggerKeywords: keywords.length > 0 ? keywords : [toSlug(name)],
      assessmentItems: assessmentItems && assessmentItems.length > 0 ? assessmentItems : undefined,
      suggestedActions: content.actions,
      redFlags: content.redFlags,
      medicationNotes: content.medications.length > 0 ? content.medications : undefined,
      radioReportNeeds: radioNeeds,
      pcrDocumentationNeeds: pcrNeeds,
      sourceExcerpt: raw.raw,
      disclaimer,
      parseConfidence,
      needsReview,
    },
    category: category?.category ?? null,
    needsReview,
  };
}

function extractKeywordsFromHeading(heading: string): string[] {
  if (!heading) return [];
  const words = heading.toLowerCase()
    .replace(/[^a-z0-9\s/]/g, ' ')
    .split(/[\s/]+/)
    .filter(w => w.length > 2)
    .filter(w => !STOP_WORDS.has(w));
  if (heading.length <= 40) return [heading.toLowerCase(), ...words];
  return words;
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was', 'has', 'have',
  'not', 'but', 'can', 'will', 'per', 'all', 'any', 'may', 'use', 'see', 'also',
  'section', 'protocol', 'procedure', 'guideline', 'treatment', 'management',
]);

function buildFallbackSection(rawText: string, regionName: string): ProtocolSection {
  const content = extractContent(rawText);

  return {
    id: 'general-protocol',
    name: `${regionName} — General Protocol`,
    triggerKeywords: extractKeywordsFromHeading(regionName),
    suggestedActions: content.actions.length > 0
      ? content.actions
      : [`Review ${regionName} protocol — verify per local protocol.`],
    redFlags: content.redFlags,
    medicationNotes: content.medications.length > 0 ? content.medications : undefined,
    radioReportNeeds: [],
    pcrDocumentationNeeds: [],
    sourceExcerpt: rawText,
    disclaimer: 'Needs review — could not identify structured protocol sections. Full source text preserved. Verify all content per local protocol and medical direction.',
    parseConfidence: 'low',
    needsReview: true,
  };
}

function generateParseWarnings(
  input: ParseInput,
  sections: ProtocolSection[],
  needsReviewCount: number,
  categoriesMatched: Set<string>,
): string[] {
  const warnings: string[] = [];

  if (!input.version || input.version === 'draft') {
    warnings.push('No protocol version specified — unable to verify currency.');
  }
  if (!input.effectiveDate) {
    warnings.push('No effective date provided — protocol may not reflect current guidelines.');
  }
  if (sections.length === 0) {
    warnings.push('No protocol sections detected.');
  } else if (sections.length < 3) {
    warnings.push(`Only ${sections.length} section(s) detected — protocol coverage may be incomplete.`);
  }
  if (needsReviewCount > 0) {
    warnings.push(`${needsReviewCount} of ${sections.length} section(s) could not be fully parsed and need manual review.`);
  }
  if (categoriesMatched.size === 0 && sections.length > 0) {
    warnings.push('No standard protocol categories matched — all sections require verification.');
  }
  if (input.confidence === 'low') {
    warnings.push('Source has low confidence — verify all content against official protocol documents.');
  }

  return warnings;
}
