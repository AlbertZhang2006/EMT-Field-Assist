// --- Transcript & Guidance ---

export interface TranscriptEntry {
  id: string;
  timestamp: number;
  text: string;
  speaker: 'emt';
}

export type GuidanceType =
  | 'prompt'
  | 'protocol'
  | 'warning'
  | 'missing_info'
  | 'protocol_reminder'
  | 'differential'
  | 'documentation'
  | 'safety';

export type GuidancePriority = 'low' | 'medium' | 'high';

export interface GuidanceEntry {
  id: string;
  timestamp: number;
  text: string;
  type: GuidanceType;
  priority?: GuidancePriority;
  protocolSection?: string;
}

// --- Protocol Source Types ---

export type SourceType = 'state_bureau' | 'regional_council' | 'county_agency' | 'bundled' | 'manual_import' | 'pasted_text';
export type Confidence = 'high' | 'medium' | 'low';

export interface ProtocolSearchResult {
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

// --- Protocol Section (single protocol within a region) ---

export interface ProtocolSection {
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

export type Protocol = ProtocolSection & { keyAssessmentItems?: string[]; sourceText?: string };

// --- Imported Protocol (full protocol region package) ---

export interface ImportedProtocol {
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

export type ProtocolRegion = ImportedProtocol;

// --- Central Clinical Facts ---

export interface ClinicalFacts {
  patientAge: string | null;
  patientSex: string | null;
  chiefComplaint: string | null;
  mentalStatus: string | null;
  allergies: string | null;
  medications: string | null;
  pastMedicalHistory: string | null;
  vitalsLatest: string | null;
  vitalsTrend: string[];
  treatmentsGiven: string | null;
  responseToTreatment: string | null;
  destination: string | null;
  eta: string | null;
  assessmentFindings: string | null;
  pertinentNegatives: string[];
  missingItems: string[];
}

// --- Call Data ---

export interface CallSnapshot extends ClinicalFacts {
  vitals: string | null;
  suspectedDifferentials: string[];
  protocolFlags: string[];
}

export type DataMode = 'local_draft' | 'ai_assisted' | 'protocol_only';

export interface CallRecord {
  id: string;
  startedAt: number;
  endedAt?: number;
  dataMode: DataMode;
  transcript: TranscriptEntry[];
  guidance: GuidanceEntry[];
  snapshot: CallSnapshot;
  summary?: string;
  radioReport?: string;
  pcrDraft?: string;
  debrief?: string;
}
