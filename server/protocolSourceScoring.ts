// Protocol source scoring and confidence classification.
//
// Used by the search endpoint to rank results and assign confidence.
// Designed for both curated index entries and future web search results
// where sourceUrl, organization name, and document metadata are available.

type Confidence = 'high' | 'medium' | 'low';

export interface ScoreInput {
  sourceUrl?: string | null;
  sourceOrganization?: string;
  sourceType?: string;
  version?: string;
  effectiveDate?: string;
  lastCheckedAt?: string | null;
  protocolTitle?: string;
  regionName?: string;
  notes?: string;
}

export interface ScoreResult {
  score: number;       // 0–100, higher is better
  confidence: Confidence;
  reasons: string[];   // human-readable explanation of scoring factors
}

// ============================================================
// Domain authority
// ============================================================

const GOV_DOMAIN_RE = /\.gov(?:\/|$)/i;
const STATE_HEALTH_RE = /\.(state\.[a-z]{2}\.us|[a-z]{2}\.gov)(?:\/|$)/i;
const EDU_DOMAIN_RE = /\.edu(?:\/|$)/i;

const PENALTY_DOMAINS = [
  /reddit\.com/i,
  /quora\.com/i,
  /stackexchange\.com/i,
  /facebook\.com/i,
  /twitter\.com/i,
  /x\.com/i,
  /youtube\.com/i,
  /scribd\.com/i,
  /slideshare\.net/i,
  /archive\.org/i,
  /coursehero\.com/i,
  /chegg\.com/i,
];

const MIRROR_SIGNALS = [
  /mirror/i,
  /cache/i,
  /repost/i,
  /copy\s*of/i,
  /unofficial/i,
];

function scoreDomain(url: string | null | undefined): { points: number; reasons: string[] } {
  if (!url) return { points: 0, reasons: [] };

  const reasons: string[] = [];
  let points = 0;

  if (GOV_DOMAIN_RE.test(url)) {
    points += 25;
    reasons.push('+25 .gov domain');
  }
  if (STATE_HEALTH_RE.test(url)) {
    points += 10;
    reasons.push('+10 state health/gov subdomain');
  }
  if (EDU_DOMAIN_RE.test(url)) {
    points += 5;
    reasons.push('+5 .edu domain');
  }

  for (const re of PENALTY_DOMAINS) {
    if (re.test(url)) {
      points -= 20;
      reasons.push('-20 forum/social/mirror site');
      break;
    }
  }

  for (const re of MIRROR_SIGNALS) {
    if (re.test(url)) {
      points -= 10;
      reasons.push('-10 mirror/unofficial signal in URL');
      break;
    }
  }

  if (/\.pdf($|\?)/i.test(url)) {
    points += 5;
    reasons.push('+5 direct PDF link');
  }

  return { points, reasons };
}

// ============================================================
// Source organization authority
// ============================================================

const HIGH_AUTHORITY_ORG = [
  /\bbureau\s+of\s+e\.?m\.?s\.?\b/i,
  /\boffice\s+of\s+e\.?m\.?s\.?\b/i,
  /\bdepartment\s+of\s+health\b/i,
  /\bdept\.?\s+of\s+health\b/i,
  /\be\.?m\.?s\.?\s+authority\b/i,
  /\bemsa\b/i,
  /\bstate\s+e\.?m\.?s\.?\b/i,
];

const MEDIUM_AUTHORITY_ORG = [
  /\bremsco\b/i,
  /\bregional\s+e\.?m\.?s\.?\b/i,
  /\bcounty\s+e\.?m\.?s\.?\b/i,
  /\be\.?m\.?s\.?\s+agency\b/i,
  /\be\.?m\.?s\.?\s+council\b/i,
  /\bfire\s+department\b/i,
  /\bfire\s+district\b/i,
  /\bmedical\s+director\b/i,
];

function scoreOrganization(org: string | undefined): { points: number; reasons: string[] } {
  if (!org) return { points: 0, reasons: ['-5 no source organization'], };

  const reasons: string[] = [];
  let points = 0;

  for (const re of HIGH_AUTHORITY_ORG) {
    if (re.test(org)) {
      points += 20;
      reasons.push('+20 high-authority EMS organization');
      break;
    }
  }

  if (points === 0) {
    for (const re of MEDIUM_AUTHORITY_ORG) {
      if (re.test(org)) {
        points += 10;
        reasons.push('+10 regional/county EMS organization');
        break;
      }
    }
  }

  if (points === 0 && org.length > 0) {
    reasons.push('+0 unrecognized organization');
  }

  return { points, reasons };
}

// ============================================================
// Source type
// ============================================================

const SOURCE_TYPE_SCORES: Record<string, number> = {
  state_bureau: 20,
  county_agency: 12,
  regional_council: 12,
  bundled: 5,
  manual_import: 0,
  pasted_text: 0,
};

function scoreSourceType(type: string | undefined): { points: number; reasons: string[] } {
  if (!type) return { points: 0, reasons: [] };
  const pts = SOURCE_TYPE_SCORES[type] ?? 0;
  if (pts > 0) {
    return { points: pts, reasons: [`+${pts} source type: ${type}`] };
  }
  return { points: 0, reasons: [] };
}

// ============================================================
// Document freshness and versioning
// ============================================================

function scoreFreshness(input: ScoreInput): { points: number; reasons: string[] } {
  const reasons: string[] = [];
  let points = 0;

  if (input.version && input.version.length > 0) {
    points += 5;
    reasons.push('+5 has version number');
  }

  if (input.effectiveDate) {
    points += 5;
    reasons.push('+5 has effective date');

    const effDate = new Date(input.effectiveDate);
    const now = new Date();
    const ageYears = (now.getTime() - effDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

    if (ageYears <= 1) {
      points += 10;
      reasons.push('+10 effective date within 1 year');
    } else if (ageYears <= 3) {
      points += 5;
      reasons.push('+5 effective date within 3 years');
    } else if (ageYears > 5) {
      points -= 10;
      reasons.push('-10 effective date older than 5 years');
    }
  } else {
    points -= 5;
    reasons.push('-5 no effective date');
  }

  if (input.lastCheckedAt) {
    const checked = new Date(input.lastCheckedAt);
    const now = new Date();
    const daysSinceCheck = (now.getTime() - checked.getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceCheck <= 90) {
      points += 5;
      reasons.push('+5 checked within 90 days');
    }
  }

  return { points, reasons };
}

// ============================================================
// Content signals (from title, notes, org name)
// ============================================================

const EMS_PROTOCOL_SIGNALS = [
  /\bems\s+protocol/i,
  /\btreatment\s+protocol/i,
  /\btreatment\s+guideline/i,
  /\bstanding\s+order/i,
  /\bclinical\s+practice\s+guideline/i,
  /\bpre-?hospital/i,
  /\bparamedic\b/i,
  /\bemt\b/i,
  /\bbls\b/i,
  /\bals\b/i,
];

const LOW_QUALITY_SIGNALS = [
  /\bforum\b/i,
  /\bdiscussion\b/i,
  /\bquestion\b/i,
  /\bhow\s+to\b/i,
  /\bstudy\s+guide\b/i,
  /\bflashcard/i,
  /\bpractice\s+test/i,
  /\bsample\s+exam/i,
];

function scoreContent(input: ScoreInput): { points: number; reasons: string[] } {
  const reasons: string[] = [];
  let points = 0;

  const text = [input.protocolTitle, input.notes, input.sourceOrganization].filter(Boolean).join(' ');

  let emsHits = 0;
  for (const re of EMS_PROTOCOL_SIGNALS) {
    if (re.test(text)) emsHits++;
  }
  if (emsHits >= 3) {
    points += 10;
    reasons.push('+10 strong EMS protocol signals in metadata');
  } else if (emsHits >= 1) {
    points += 5;
    reasons.push('+5 EMS protocol signals in metadata');
  }

  for (const re of LOW_QUALITY_SIGNALS) {
    if (re.test(text)) {
      points -= 10;
      reasons.push('-10 low-quality content signal (forum/study material)');
      break;
    }
  }

  return { points, reasons };
}

// ============================================================
// Public API
// ============================================================

export function scoreSource(input: ScoreInput): ScoreResult {
  const factors = [
    scoreDomain(input.sourceUrl),
    scoreOrganization(input.sourceOrganization),
    scoreSourceType(input.sourceType),
    scoreFreshness(input),
    scoreContent(input),
  ];

  let raw = 0;
  const reasons: string[] = [];
  for (const f of factors) {
    raw += f.points;
    reasons.push(...f.reasons);
  }

  const score = Math.max(0, Math.min(100, raw));

  let confidence: Confidence;
  if (score >= 50) {
    confidence = 'high';
  } else if (score >= 25) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return { score, confidence, reasons };
}

export function compareByScore(a: ScoreResult, b: ScoreResult): number {
  return b.score - a.score;
}
