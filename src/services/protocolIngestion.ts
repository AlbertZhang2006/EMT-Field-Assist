import type { ProtocolSection, ProtocolRegion, ImportedProtocol } from '../types/index';

const CUSTOM_REGIONS_KEY = 'emt-custom-regions';

// --- Validation ---

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((i) => typeof i === 'string');
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateProtocol(p: any, index: number): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const label = `Protocol #${index + 1}${p.name ? ` (${p.name})` : ''}`;

  if (!isNonEmptyString(p.name)) errors.push(`${label}: missing "name".`);
  if (!isNonEmptyString(p.id)) {
    if (isNonEmptyString(p.name)) {
      p.id = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    } else {
      errors.push(`${label}: missing "id".`);
    }
  }
  if (!isStringArray(p.triggerKeywords) || p.triggerKeywords.length === 0) {
    errors.push(`${label}: "triggerKeywords" must be a non-empty string array.`);
  }
  if (!isStringArray(p.suggestedActions) || p.suggestedActions.length === 0) {
    errors.push(`${label}: "suggestedActions" must be a non-empty string array.`);
  }
  if (!isStringArray(p.redFlags)) warnings.push(`${label}: "redFlags" is missing or empty.`);
  if (!isStringArray(p.radioReportNeeds)) warnings.push(`${label}: "radioReportNeeds" is missing.`);
  if (!isStringArray(p.pcrDocumentationNeeds)) warnings.push(`${label}: "pcrDocumentationNeeds" is missing.`);
  if (!isNonEmptyString(p.disclaimer)) warnings.push(`${label}: "disclaimer" is missing.`);

  return { errors, warnings };
}

export function validateRegion(data: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Input is not a valid JSON object.'], warnings: [] };
  }

  if (!isNonEmptyString(data.regionName)) errors.push('"regionName" is required.');
  if (!Array.isArray(data.protocols)) {
    errors.push('"protocols" must be an array.');
    return { valid: false, errors, warnings };
  }

  if (data.protocols.length === 0) warnings.push('Protocol list is empty.');

  for (let i = 0; i < data.protocols.length; i++) {
    const result = validateProtocol(data.protocols[i], i);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  if (!data.version) warnings.push('"version" is not set.');
  if (!data.effectiveDate) warnings.push('"effectiveDate" is not set.');

  return { valid: errors.length === 0, errors, warnings };
}

// --- JSON ingestion ---

export function parseProtocolJSON(jsonString: string): { region: ProtocolRegion | null; validation: ValidationResult } {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e: any) {
    return {
      region: null,
      validation: { valid: false, errors: [`Invalid JSON: ${e.message}`], warnings: [] },
    };
  }

  const validation = validateRegion(parsed);
  if (!validation.valid) return { region: null, validation };

  const region = normalizeRegion(parsed);
  return { region, validation };
}

function normalizeRegion(data: any): ImportedProtocol {
  return {
    regionName: data.regionName,
    state: data.state ?? undefined,
    agencyName: data.agencyName ?? undefined,
    sourceOrganization: data.sourceOrganization ?? undefined,
    sourceUrl: data.sourceUrl ?? undefined,
    sourceDocumentTitle: data.sourceDocumentTitle ?? undefined,
    version: data.version ?? undefined,
    effectiveDate: data.effectiveDate ?? undefined,
    lastCheckedAt: data.lastCheckedAt ?? undefined,
    importedAt: new Date().toISOString(),
    confidence: data.confidence ?? undefined,
    rawSourceText: data.rawSourceText ?? undefined,
    protocols: data.protocols.map(normalizeProtocol),
  };
}

function normalizeProtocol(p: any): ProtocolSection {
  const assessItems = p.assessmentItems ?? p.keyAssessmentItems ?? [];
  return {
    id: p.id ?? p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: p.name,
    category: p.category ?? undefined,
    triggerKeywords: p.triggerKeywords ?? [],
    inclusionCriteria: p.inclusionCriteria ?? undefined,
    exclusionCriteria: p.exclusionCriteria ?? undefined,
    assessmentItems: assessItems.length > 0 ? assessItems : undefined,
    suggestedActions: p.suggestedActions ?? [],
    redFlags: p.redFlags ?? [],
    medicationNotes: p.medicationNotes ?? undefined,
    medicalDirectionRequired: p.medicalDirectionRequired ?? undefined,
    radioReportNeeds: p.radioReportNeeds ?? [],
    pcrDocumentationNeeds: p.pcrDocumentationNeeds ?? [],
    sourceExcerpt: p.sourceExcerpt ?? p.sourceText ?? undefined,
    disclaimer: p.disclaimer ?? 'Advisory guidance only. Verify per local protocol.',
    parseConfidence: p.parseConfidence ?? undefined,
    needsReview: p.needsReview ?? undefined,
  };
}

// --- Plain text to scaffold ---

export function scaffoldFromText(regionName: string, plainText: string): ImportedProtocol {
  const sections = plainText.split(/\n{2,}/).filter((s) => s.trim());
  const protocols: ProtocolSection[] = [];

  if (sections.length === 0) {
    return { regionName, version: 'draft', protocols: [] };
  }

  for (const section of sections) {
    const lines = section.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const name = lines[0].replace(/^#+\s*/, '').replace(/[:\-–—]+$/, '').trim();
    const bodyLines = lines.slice(1).map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);

    const keywords: string[] = [];
    const actions: string[] = [];
    const flags: string[] = [];

    for (const line of bodyLines) {
      const lower = line.toLowerCase();
      if (lower.includes('keyword') || lower.includes('trigger')) {
        keywords.push(...line.replace(/.*?:\s*/, '').split(/[,;]/).map((k) => k.trim()).filter(Boolean));
      } else if (lower.includes('red flag') || lower.includes('warning') || lower.includes('caution')) {
        flags.push(line);
      } else {
        actions.push(line.startsWith('Consider') || line.startsWith('Verify') ? line : `Consider: ${line}`);
      }
    }

    if (keywords.length === 0) {
      keywords.push(...name.toLowerCase().split(/[\s/,]+/).filter((w) => w.length > 2));
    }

    protocols.push({
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      name,
      triggerKeywords: keywords,
      suggestedActions: actions.length > 0 ? actions : [`Review ${name} protocol — verify per local protocol.`],
      redFlags: flags,
      radioReportNeeds: [],
      pcrDocumentationNeeds: [],
      sourceExcerpt: section,
      disclaimer: `Scaffolded from plain text. Verify all actions per local ${name} protocol.`,
    });
  }

  return { regionName, version: 'draft', protocols };
}

// --- Persistence ---

export function getCustomRegions(): Record<string, ProtocolRegion> {
  try {
    const raw = localStorage.getItem(CUSTOM_REGIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveCustomRegion(id: string, region: ProtocolRegion): void {
  const all = getCustomRegions();
  all[id] = region;
  localStorage.setItem(CUSTOM_REGIONS_KEY, JSON.stringify(all));
}

export function deleteCustomRegion(id: string): void {
  const all = getCustomRegions();
  delete all[id];
  localStorage.setItem(CUSTOM_REGIONS_KEY, JSON.stringify(all));
}

export function listCustomRegionIds(): string[] {
  return Object.keys(getCustomRegions());
}
