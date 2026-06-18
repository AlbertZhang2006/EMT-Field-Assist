import type { ImportedProtocol, ProtocolSearchResult } from '../types/index';
import { resultToImportedProtocol } from './protocolSearchService';
import { saveCustomRegion } from './protocolIngestion';
import { parse, type ParseInput, type ParseStats } from './protocolParserService';
import { setActiveRegion } from './guidanceEngine';

// --- Service interface ---
//
// protocolImportService owns the full pipeline:
//   source identification → content fetch → parse → review → save → activate
//
// The pipeline is split into preview and activation:
//   previewFromText(input)   → parse without saving; returns warnings
//   previewFromSource(result) → import without saving; returns warnings
//   activateProtocol(preview) → save and activate after user acknowledges warnings
//
// Backend endpoint contract (when VITE_PROTOCOL_IMPORT_URL is set):
//   POST {VITE_PROTOCOL_IMPORT_URL}
//   Body: { sourceUrl, sourceOrganization, regionName, state, protocolTitle }
//   Response: { importedProtocol: ImportedProtocol }

// --- Types ---

export interface ImportPreview {
  protocol: ImportedProtocol;
  regionId: string;
  parseStats?: ParseStats;
  warnings: string[];
}

export class ImportError extends Error {
  readonly userMessage: string;
  constructor(message: string, userMessage: string) {
    super(message);
    this.name = 'ImportError';
    this.userMessage = userMessage;
  }
}

// --- Backend URL ---

function getBackendUrl(): string | null {
  try {
    return (import.meta as any).env?.VITE_PROTOCOL_IMPORT_URL ?? null;
  } catch {
    return null;
  }
}

// --- Backend import ---

interface BackendImportResponse {
  importedProtocol: ImportedProtocol;
}

function validateBackendProtocol(data: any): data is ImportedProtocol {
  return (
    data != null &&
    typeof data === 'object' &&
    typeof data.regionName === 'string' &&
    Array.isArray(data.protocols)
  );
}

async function importFromBackend(
  url: string,
  result: ProtocolSearchResult,
): Promise<ImportedProtocol> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      sourceUrl: result.sourceUrl,
      sourceOrganization: result.sourceOrganization,
      regionName: result.regionName,
      state: result.state,
      protocolTitle: result.protocolTitle,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 404) {
      throw new ImportError(
        `Backend returned 404 for ${result.regionName}`,
        'Protocol source not found on server. Try pasting protocol text instead.',
      );
    }
    if (status === 429) {
      throw new ImportError(
        `Backend rate limited`,
        'Too many requests. Please wait a moment and try again.',
      );
    }
    if (status >= 500) {
      throw new ImportError(
        `Backend server error: ${status}`,
        'Server error during import. Please try again later.',
      );
    }
    throw new ImportError(
      `Backend import failed: ${status}`,
      `Import failed (error ${status}). Please try again.`,
    );
  }

  let data: BackendImportResponse;
  try {
    data = await response.json();
  } catch {
    throw new ImportError(
      'Invalid JSON in backend response',
      'Received an invalid response from the server.',
    );
  }

  if (!validateBackendProtocol(data.importedProtocol)) {
    throw new ImportError(
      'Backend response missing valid importedProtocol',
      'Server returned incomplete protocol data. Try pasting protocol text instead.',
    );
  }

  const protocol = data.importedProtocol;
  protocol.importedAt = new Date().toISOString();
  if (!protocol.confidence) {
    protocol.confidence = result.confidence;
  }

  return protocol;
}

// --- Warning generation for non-parsed protocols ---

function generateWarnings(protocol: ImportedProtocol): string[] {
  const warnings: string[] = [];

  if (!protocol.version) {
    warnings.push('No protocol version specified — unable to verify currency.');
  }
  if (!protocol.effectiveDate) {
    warnings.push('No effective date provided — protocol may not reflect current guidelines.');
  }
  if (protocol.protocols.length === 0) {
    warnings.push('No protocol sections detected.');
  } else if (protocol.protocols.length < 3) {
    warnings.push(`Only ${protocol.protocols.length} section(s) detected — protocol coverage may be incomplete.`);
  }

  const reviewCount = protocol.protocols.filter(s => s.needsReview).length;
  if (reviewCount > 0) {
    warnings.push(`${reviewCount} of ${protocol.protocols.length} section(s) need manual review.`);
  }

  if (protocol.confidence === 'low') {
    warnings.push('Source has low confidence — verify all content against official protocol documents.');
  }

  return warnings;
}

// --- Preview from pasted text (parse without activating) ---

export function previewFromText(input: ParseInput): ImportPreview {
  const result = parse(input);
  const regionId = `pasted-${input.regionName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return {
    protocol: result.protocol,
    regionId,
    parseStats: result.stats,
    warnings: result.warnings,
  };
}

// --- Preview from search result (import without activating) ---

export async function previewFromSource(result: ProtocolSearchResult): Promise<ImportPreview> {
  if (result.id === 'demo-region') {
    const protocol = resultToImportedProtocol(result);
    return { protocol, regionId: 'demo', warnings: [] };
  }

  const backendUrl = getBackendUrl();
  let protocol: ImportedProtocol;

  if (backendUrl) {
    protocol = await importFromBackend(backendUrl, result);
  } else {
    await new Promise((r) => setTimeout(r, 200));
    protocol = resultToImportedProtocol(result);
  }

  const regionId = protocol.id ?? `search-${result.id}`;
  protocol.id = regionId;

  const warnings = protocol.parseWarnings ?? generateWarnings(protocol);
  protocol.parseWarnings = warnings.length > 0 ? warnings : undefined;

  return { protocol, regionId, warnings };
}

// --- Activate a previewed protocol ---

export function activateProtocol(preview: ImportPreview): void {
  if (preview.regionId === 'demo') {
    setActiveRegion('demo');
    return;
  }
  saveCustomRegion(preview.regionId, preview.protocol);
  setActiveRegion(preview.regionId);
}

// --- Import from pasted text (parse + save + activate in one step) ---

export async function importFromText(input: ParseInput): Promise<ImportPreview> {
  const preview = previewFromText(input);
  activateProtocol(preview);
  return preview;
}
