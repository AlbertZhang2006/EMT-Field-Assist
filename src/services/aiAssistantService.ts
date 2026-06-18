import type { GuidanceEntry, GuidanceType, GuidancePriority, CallSnapshot, Protocol } from '../types/index';
import { getMatchedProtocols, getActiveRegionName, getProtocolQualifier, getActiveRegionMeta } from './guidanceEngine';
import { isAIEnabled } from './privacySettings';

// --- Types ---

export interface AssistantInput {
  latestStatement: string;
  fullTranscript: string[];
  snapshot: CallSnapshot;
  regionName: string;
  matchedProtocols: Protocol[];
  missingItems: string[];
}

export interface AssistantResponse {
  guidance: GuidanceEntry[];
  source: 'mock' | 'claude';
}

export type AssistantMode = 'mock' | 'claude';

// --- Configuration ---

let _apiKeyWarned = false;
function getApiKey(): string | null {
  try {
    const key = (import.meta as any).env?.VITE_ANTHROPIC_API_KEY ?? null;
    if (key && !_apiKeyWarned && (import.meta as any).env?.PROD) {
      console.warn('[EMT Field Assist] API key is embedded in the client bundle. In production, route AI requests through a backend proxy instead.');
      _apiKeyWarned = true;
    }
    return key;
  } catch {
    return null;
  }
}

export function getAssistantMode(): AssistantMode {
  if (!isAIEnabled()) return 'mock';
  return getApiKey() ? 'claude' : 'mock';
}

// --- Helpers ---

function makeEntry(text: string, type: GuidanceType, priority?: GuidancePriority): GuidanceEntry {
  return { id: crypto.randomUUID(), timestamp: Date.now(), text, type, priority };
}

function buildInput(
  latestStatement: string,
  fullTranscript: string[],
  snapshot: CallSnapshot,
): AssistantInput {
  return {
    latestStatement,
    fullTranscript,
    snapshot,
    regionName: getActiveRegionName(),
    matchedProtocols: getMatchedProtocols(),
    missingItems: snapshot.missingItems,
  };
}

// --- Mock implementation ---

function mockGuidance(_input: AssistantInput): GuidanceEntry[] {
  return [];
}

// --- System prompt ---

const SYSTEM_PROMPT = `You are an EMS field documentation and protocol-support assistant embedded in an EMT's mobile app. You operate during active patient encounters. Your role is to quietly support the EMT with documentation completeness, protocol adherence, and clinical decision-support — never to replace their judgment.

## What you help with
1. MISSING ASSESSMENT QUESTIONS — Identify undocumented assessment items that are standard for the presenting complaint (OPQRST, SAMPLE, focused exam findings).
2. DIFFERENTIAL CONSIDERATIONS — Suggest 1–2 plausible differentials based on the clinical picture. Frame as considerations, not diagnoses.
3. PROTOCOL REMINDERS — Reference relevant actions from the loaded protocol JSON. Always include "verify per local protocol."
4. RADIO REPORT COMPLETENESS — Flag missing elements needed for a standard EMS radio report (age/sex, CC, history, vitals, treatments, response, ETA).
5. PCR DOCUMENTATION COMPLETENESS — Note undocumented fields that will be needed for the patient care report (times, serial vitals, intervention details, reassessments).
6. REASSESSMENT REMINDERS — After interventions, prompt for reassessment and response documentation.

## What you must NEVER do
- Diagnose with certainty. Say "consider" or "differential includes," never "this is."
- Give direct medical orders. Never say "administer," "give," or "you must." Always use advisory language: "consider," "verify per local protocol," or "contact medical direction if required."
- Present protocol guidance as definitive medical orders. Protocol references are advisory. Use the protocol qualifier provided in the developer context.
- Invent clinical facts. Only reference what appears in the transcript or extracted data.
- Recommend care outside the loaded protocol. If no protocol is loaded, limit guidance to documentation completeness.
- Produce long explanations. This is a field app used during active calls. Every word must earn its place.
- Reference your own existence, capabilities, or limitations. Just provide the guidance.

## Output format
Return ONLY a JSON object. No markdown, no explanation, no preamble.

{
  "messages": [
    {
      "type": "missing_info | protocol_reminder | differential | documentation | safety",
      "priority": "low | medium | high",
      "text": "Short field-friendly message"
    }
  ]
}

Type definitions:
- missing_info: An assessment item or history element not yet documented.
- protocol_reminder: An action suggested by the loaded protocol for this presentation.
- differential: A clinical consideration based on the current picture.
- documentation: A PCR or radio report documentation gap.
- safety: A high-priority clinical concern or red flag. Use sparingly.

Priority definitions:
- low: Helpful but not time-sensitive. Documentation completeness items.
- medium: Should be addressed during this encounter. Assessment gaps, protocol steps.
- high: Time-sensitive or safety-critical. Red flags, airway concerns, critical vitals.

Rules for messages:
- Return 1–3 messages. Never more than 3. Return an empty array if you have nothing useful to add.
- Each message must be one concise sentence. Maximum ~20 words.
- Use advisory language in every message: "Consider…", "Verify…", "Missing…", "Document…", "Contact medical direction if…"
- Do not repeat information already provided by the rule-based guidance system (the app already shows protocol actions and missing-field warnings).
- Focus on what the rule-based system CANNOT do: clinical context, differential reasoning, reassessment timing, subtle documentation gaps.`;

// --- Developer prompt (context builder) ---

function buildDeveloperContext(input: AssistantInput): string {
  const sections: string[] = [];

  const meta = getActiveRegionMeta();
  const qualifier = getProtocolQualifier();

  sections.push(`[CALL CONTEXT]
Region: ${input.regionName}
Protocol confidence: ${meta.confidence}
Protocol qualifier: "${qualifier}"
Transcript entries so far: ${input.fullTranscript.length}

When referencing protocol actions, use the phrase "${qualifier}" — never present guidance as definitive medical orders.${
    meta.id === 'none' ? '\nNo protocol is loaded. Limit guidance to documentation completeness.' : ''
  }`);

  if (input.matchedProtocols.length > 0) {
    const protoLines = input.matchedProtocols.map((p) => {
      const assess = (p.assessmentItems ?? p.keyAssessmentItems ?? []).join(', ');
      const flags = p.redFlags.join(' | ');
      const actions = p.suggestedActions.slice(0, 3).join(' | ');
      return `  ${p.name}:\n    Assess: ${assess}\n    Red flags: ${flags}\n    Key actions: ${actions}`;
    }).join('\n');
    sections.push(`[ACTIVE PROTOCOLS]\n${protoLines}`);
  } else {
    sections.push(`[ACTIVE PROTOCOLS]\nNone matched yet. Limit guidance to documentation completeness.`);
  }

  const snap = input.snapshot;
  const documented: string[] = [];
  const empty: string[] = [];
  const fieldMap: [string, string | null][] = [
    ['Age', snap.patientAge],
    ['Sex', snap.patientSex],
    ['Chief complaint', snap.chiefComplaint],
    ['Mental status', snap.mentalStatus],
    ['Vitals', snap.vitals],
    ['Allergies', snap.allergies],
    ['Medications', snap.medications],
    ['PMH', snap.pastMedicalHistory],
    ['Assessment findings', snap.assessmentFindings],
    ['Treatments', snap.treatmentsGiven],
    ['Treatment response', snap.responseToTreatment],
    ['Destination', snap.destination],
    ['ETA', snap.eta],
  ];

  for (const [label, value] of fieldMap) {
    if (value) documented.push(`  ${label}: ${value}`);
    else empty.push(label);
  }

  sections.push(`[EXTRACTED PATIENT DATA]\n${documented.length > 0 ? documented.join('\n') : '  (none yet)'}`);

  if (empty.length > 0) {
    sections.push(`[UNDOCUMENTED FIELDS]\n  ${empty.join(', ')}`);
  }

  if (snap.suspectedDifferentials.length > 0) {
    sections.push(`[RULE-BASED DIFFERENTIALS]\n  ${snap.suspectedDifferentials.join(', ')}`);
  }

  if (input.missingItems.length > 0) {
    sections.push(`[RULE-BASED MISSING ITEMS — already shown to EMT]\n  ${input.missingItems.join(', ')}\n  (Do not repeat these. Add clinical context the rule engine cannot provide.)`);
  }

  return sections.join('\n\n');
}

function buildUserMessage(input: AssistantInput): string {
  const recent = input.fullTranscript.slice(-6);
  const transcriptBlock = recent.length > 1
    ? `[RECENT TRANSCRIPT]\n${recent.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}`
    : '';

  return `${transcriptBlock}

[LATEST EMT STATEMENT]
"${input.latestStatement}"

Based on the call context and this latest statement, provide 1–3 short advisory messages. JSON only.`.trim();
}

// --- Response parser with fallback ---

const VALID_TYPES = new Set<GuidanceType>(['missing_info', 'protocol_reminder', 'differential', 'documentation', 'safety']);
const VALID_PRIORITIES = new Set<GuidancePriority>(['low', 'medium', 'high']);

function normalizeType(raw: string): GuidanceType {
  const lower = raw?.toLowerCase().trim();
  if (VALID_TYPES.has(lower as GuidanceType)) return lower as GuidanceType;
  if (lower === 'missing' || lower === 'missing info') return 'missing_info';
  if (lower === 'protocol' || lower === 'reminder') return 'protocol_reminder';
  if (lower === 'diff' || lower === 'ddx') return 'differential';
  if (lower === 'doc' || lower === 'pcr' || lower === 'radio') return 'documentation';
  if (lower === 'warning' || lower === 'critical' || lower === 'red_flag') return 'safety';
  return 'documentation';
}

function normalizePriority(raw: string): GuidancePriority {
  const lower = raw?.toLowerCase().trim();
  if (VALID_PRIORITIES.has(lower as GuidancePriority)) return lower as GuidancePriority;
  return 'medium';
}

function parseAIResponse(text: string): GuidanceEntry[] {
  const cleaned = text.trim();

  // Try parsing the full response as JSON first
  try {
    const parsed = JSON.parse(cleaned);
    const messages = parsed.messages ?? parsed;
    if (Array.isArray(messages)) {
      return validateMessages(messages);
    }
  } catch { /* fall through */ }

  // Try extracting a JSON object with "messages" key
  const objMatch = cleaned.match(/\{[\s\S]*"messages"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]);
      if (Array.isArray(parsed.messages)) {
        return validateMessages(parsed.messages);
      }
    } catch { /* fall through */ }
  }

  // Try extracting a bare JSON array
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      const parsed = JSON.parse(arrMatch[0]);
      if (Array.isArray(parsed)) {
        return validateMessages(parsed);
      }
    } catch { /* fall through */ }
  }

  // Last resort: try to extract text lines as low-priority documentation hints
  const lines = cleaned.split('\n')
    .map((l) => l.replace(/^[-•*]\s*/, '').trim())
    .filter((l) => l.length > 10 && l.length < 200);
  if (lines.length > 0) {
    return lines.slice(0, 3).map((l) => makeEntry(l, 'documentation', 'low'));
  }

  return [];
}

function validateMessages(messages: any[]): GuidanceEntry[] {
  return messages
    .slice(0, 3)
    .filter((m: any) => m && typeof m.text === 'string' && m.text.trim().length > 0)
    .map((m: any) => makeEntry(
      m.text.trim(),
      normalizeType(m.type),
      normalizePriority(m.priority),
    ));
}

// --- Claude API call ---

async function claudeGuidance(input: AssistantInput, signal: AbortSignal): Promise<GuidanceEntry[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: [
      { type: 'text', text: SYSTEM_PROMPT },
      { type: 'text', text: buildDeveloperContext(input) },
    ],
    messages: [{ role: 'user', content: buildUserMessage(input) }],
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) return [];

  const data = await response.json();
  const content = data.content?.[0]?.text;
  if (!content) return [];

  return parseAIResponse(content);
}

// --- Public API ---

let pendingController: AbortController | null = null;

export async function getAIGuidance(
  latestStatement: string,
  fullTranscript: string[],
  snapshot: CallSnapshot,
): Promise<AssistantResponse> {
  if (pendingController) {
    pendingController.abort();
    pendingController = null;
  }

  const input = buildInput(latestStatement, fullTranscript, snapshot);
  const mode = getAssistantMode();

  if (mode === 'mock') {
    return { guidance: mockGuidance(input), source: 'mock' };
  }

  pendingController = new AbortController();
  const { signal } = pendingController;

  try {
    const guidance = await claudeGuidance(input, signal);
    pendingController = null;
    return { guidance, source: 'claude' };
  } catch (err: any) {
    pendingController = null;
    if (err?.name === 'AbortError') return { guidance: [], source: 'mock' };
    return { guidance: mockGuidance(input), source: 'mock' };
  }
}
