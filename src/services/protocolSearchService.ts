import type { ProtocolSearchResult, ProtocolSection, ImportedProtocol, SourceType, Confidence } from '../types/index';

export type { ProtocolSearchResult, SourceType };
export type { Confidence } from '../types/index';

// --- Service interface ---
//
// All UI code calls these functions. The implementation checks for a backend
// URL at VITE_PROTOCOL_SEARCH_URL. When set, searchProtocols() calls the
// backend; otherwise it falls back to local mock data.
//
// Backend endpoint contract:
//   GET {VITE_PROTOCOL_SEARCH_URL}?q={query}
//   Response: { results: BackendSearchResult[] }
//
// The backend is responsible for:
//   - Crawling / indexing official EMS protocol sources
//   - Fetching PDF or webpage content on demand
//   - Extracting raw text from fetched documents
//   - Returning structured metadata
//
// The client must NOT scrape websites directly.

// --- Backend response types ---

interface BackendSearchResult {
  id: string;
  regionName: string;
  state: string;
  agencyName?: string;
  protocolTitle: string;
  sourceOrganization: string;
  sourceType: string;
  sourceUrl?: string | null;
  version?: string;
  effectiveDate?: string;
  lastCheckedAt?: string | null;
  confidence: string;
  protocolCount?: number;
  notes?: string;
}

interface BackendSearchResponse {
  results: BackendSearchResult[];
}

// --- Source type & confidence normalization ---

const BACKEND_SOURCE_MAP: Record<string, SourceType> = {
  official_state: 'state_bureau',
  state_bureau: 'state_bureau',
  county: 'county_agency',
  county_agency: 'county_agency',
  agency: 'county_agency',
  regional: 'regional_council',
  regional_council: 'regional_council',
  bundled: 'bundled',
  manual_import: 'manual_import',
  pasted_text: 'pasted_text',
};

function normalizeSourceType(raw: string): SourceType {
  return BACKEND_SOURCE_MAP[raw.toLowerCase()] ?? 'manual_import';
}

function normalizeConfidence(raw: string): Confidence {
  const lower = raw.toLowerCase();
  if (lower === 'high' || lower === 'medium' || lower === 'low') return lower;
  return 'low';
}

function mapBackendResult(r: BackendSearchResult): ProtocolSearchResult {
  return {
    id: r.id,
    regionName: r.regionName,
    state: r.state,
    agencyName: r.agencyName ?? r.sourceOrganization,
    protocolTitle: r.protocolTitle,
    sourceOrganization: r.sourceOrganization,
    sourceType: normalizeSourceType(r.sourceType),
    sourceUrl: r.sourceUrl ?? null,
    version: r.version ?? '',
    effectiveDate: r.effectiveDate ?? '',
    lastCheckedAt: r.lastCheckedAt ?? null,
    confidence: normalizeConfidence(r.confidence),
    protocolCount: r.protocolCount ?? 0,
    notes: r.notes ?? '',
  };
}

// --- Backend URL ---

function getBackendUrl(): string | null {
  try {
    return (import.meta as any).env?.VITE_PROTOCOL_SEARCH_URL ?? null;
  } catch {
    return null;
  }
}

// --- Result cache (for getResultById after search) ---

let cachedResults: ProtocolSearchResult[] = [];

// --- Mock data (fallback when no backend configured) ---

const MOCK_RESULTS: ProtocolSearchResult[] = [
  {
    id: 'ny-statewide',
    regionName: 'New York State',
    state: 'NY',
    agencyName: 'NYS Bureau of EMS',
    protocolTitle: 'New York Statewide BLS & ALS Protocols',
    sourceOrganization: 'NY Bureau of EMS (BEMS)',
    sourceType: 'state_bureau',
    sourceUrl: null,
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
    sourceUrl: null,
    version: '7.0',
    effectiveDate: '2023-12-01',
    lastCheckedAt: '2026-06-01',
    confidence: 'high',
    protocolCount: 38,
    notes: 'Statewide pre-hospital treatment protocols for EMT, AEMT, and Paramedic levels. Includes pharmacology reference and standing orders.',
  },
  {
    id: 'ct-statewide',
    regionName: 'Connecticut',
    state: 'CT',
    agencyName: 'CT Office of EMS',
    protocolTitle: 'Connecticut Statewide EMS Protocols',
    sourceOrganization: 'CT Office of EMS',
    sourceType: 'state_bureau',
    sourceUrl: null,
    version: '2025.0',
    effectiveDate: '2025-01-01',
    lastCheckedAt: '2026-06-01',
    confidence: 'high',
    protocolCount: 35,
    notes: 'Statewide EMS protocols covering BLS and ALS operations, medical, trauma, obstetric, pediatric, and environmental emergencies.',
  },
  {
    id: 'demo-region',
    regionName: 'Demo EMS Region',
    state: 'Demo',
    agencyName: 'EMT Field Assist',
    protocolTitle: 'Demo EMS Region Protocols',
    sourceOrganization: 'EMT Field Assist (Bundled)',
    sourceType: 'bundled',
    sourceUrl: null,
    version: '1.0.0',
    effectiveDate: '2026-01-01',
    lastCheckedAt: null,
    confidence: 'high',
    protocolCount: 5,
    notes: 'Built-in demo protocols for Chest Pain, Respiratory Distress, Altered Mental Status, Stroke, and Trauma. For development and testing.',
  },
  {
    id: 'nys-westchester',
    regionName: 'Westchester County REMSCO',
    state: 'NY',
    agencyName: 'Westchester REMSCO',
    protocolTitle: 'Westchester Regional EMS Protocols',
    sourceOrganization: 'Westchester REMSCO',
    sourceType: 'regional_council',
    sourceUrl: null,
    version: '2024.2',
    effectiveDate: '2024-07-01',
    lastCheckedAt: '2026-05-15',
    confidence: 'medium',
    protocolCount: 28,
    notes: 'Regional protocols supplementing NY State with county-specific standing orders, destination policies, and medical direction contacts.',
  },
  {
    id: 'ca-la-county',
    regionName: 'Los Angeles County',
    state: 'CA',
    agencyName: 'LA County DHS EMS Agency',
    protocolTitle: 'LA County EMS Treatment Guidelines',
    sourceOrganization: 'LA County DHS EMS Agency',
    sourceType: 'county_agency',
    sourceUrl: null,
    version: '2024-R1',
    effectiveDate: '2024-03-15',
    lastCheckedAt: '2026-04-20',
    confidence: 'medium',
    protocolCount: 45,
    notes: 'County-level EMS protocols including scope of practice, treatment guidelines, base hospital contact procedures, and destination policies.',
  },
];

const SOURCE_LABELS: Record<SourceType, string> = {
  state_bureau: 'State Bureau of EMS',
  regional_council: 'Regional EMS Council',
  county_agency: 'County EMS Agency',
  bundled: 'Bundled with App',
  manual_import: 'Manual Import',
  pasted_text: 'Pasted Text',
};

export function getSourceLabel(type: SourceType): string {
  return SOURCE_LABELS[type] ?? type;
}

// --- Backend search ---

async function searchBackend(url: string, query: string): Promise<ProtocolSearchResult[]> {
  const endpoint = `${url}?q=${encodeURIComponent(query)}`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`Backend search failed: ${response.status}`);
  }

  const data: BackendSearchResponse = await response.json();

  if (!data.results || !Array.isArray(data.results)) {
    throw new Error('Invalid backend response: missing results array');
  }

  return data.results.map(mapBackendResult);
}

// --- Mock search ---

async function searchMock(query: string): Promise<ProtocolSearchResult[]> {
  await new Promise((r) => setTimeout(r, 400));
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return MOCK_RESULTS.filter((r) =>
    r.regionName.toLowerCase().includes(q) ||
    r.state.toLowerCase().includes(q) ||
    r.protocolTitle.toLowerCase().includes(q) ||
    r.sourceOrganization.toLowerCase().includes(q) ||
    r.agencyName.toLowerCase().includes(q) ||
    r.notes.toLowerCase().includes(q)
  );
}

// --- Public API ---

export async function searchProtocols(query: string): Promise<ProtocolSearchResult[]> {
  const q = query.trim();
  if (!q) {
    cachedResults = [];
    return [];
  }

  const backendUrl = getBackendUrl();

  let results: ProtocolSearchResult[];

  if (backendUrl) {
    try {
      results = await searchBackend(backendUrl, q);
    } catch (err) {
      console.warn('Backend protocol search failed, falling back to mock:', err);
      results = await searchMock(q);
    }
  } else {
    results = await searchMock(q);
  }

  cachedResults = results;
  return results;
}

export function getResultById(id: string): ProtocolSearchResult | undefined {
  return cachedResults.find((r) => r.id === id)
    ?? MOCK_RESULTS.find((r) => r.id === id);
}

// --- Protocol conversion (placeholder content for mock/search results) ---

function makePlaceholderSection(id: string, name: string, category: string, keywords: string[], regionName: string): ProtocolSection {
  return {
    id,
    name,
    category,
    triggerKeywords: keywords,
    assessmentItems: ['OPQRST', 'SAMPLE history', 'Focused physical exam', 'Vital signs with SpO2'],
    suggestedActions: [
      `Consider standard assessment per ${regionName} protocol — verify per local protocol.`,
      'Obtain OPQRST and SAMPLE history.',
      'Consider IV/IO access if clinically indicated — verify per local protocol.',
    ],
    redFlags: [
      'Airway compromise — manage immediately per protocol.',
      'Signs of shock — initiate fluid resuscitation, contact medical direction.',
    ],
    radioReportNeeds: ['Age, sex', 'Chief complaint', 'Vitals', 'Treatments and response', 'ETA'],
    pcrDocumentationNeeds: ['Assessment findings', 'Interventions with times', 'Patient response', 'Transport decision'],
    disclaimer: `Placeholder protocol for ${regionName}. Replace with actual protocol content when available. Verify all actions per local protocol.`,
  };
}

export function resultToImportedProtocol(result: ProtocolSearchResult): ImportedProtocol {
  if (result.id === 'demo-region') {
    return {
      id: 'demo-region',
      regionName: 'Demo EMS Region',
      version: '1.0.0',
      effectiveDate: '2026-01-01',
      sourceOrganization: result.sourceOrganization,
      confidence: 'high',
      importedAt: new Date().toISOString(),
      protocols: [],
    };
  }

  return {
    id: `search-${result.id}`,
    regionName: result.regionName,
    state: result.state,
    agencyName: result.agencyName,
    sourceOrganization: result.sourceOrganization,
    sourceUrl: result.sourceUrl ?? undefined,
    sourceDocumentTitle: result.protocolTitle,
    version: result.version,
    effectiveDate: result.effectiveDate,
    lastCheckedAt: result.lastCheckedAt ?? undefined,
    importedAt: new Date().toISOString(),
    confidence: result.confidence,
    protocols: [
      makePlaceholderSection(`${result.id}-general`, `${result.protocolTitle} — General Medical`, 'Medical',
        ['chest pain', 'shortness of breath', 'abdominal pain', 'altered mental status', 'syncope', 'seizure', 'diabetic', 'allergic reaction', 'overdose'],
        result.regionName),
      makePlaceholderSection(`${result.id}-trauma`, `${result.protocolTitle} — Trauma`, 'Trauma',
        ['trauma', 'fall', 'mva', 'mvc', 'accident', 'gunshot', 'gsw', 'stabbing', 'bleeding', 'fracture', 'injury'],
        result.regionName),
    ],
  };
}
