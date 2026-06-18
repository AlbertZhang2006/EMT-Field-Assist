import type { GuidanceEntry, CallSnapshot, Protocol, ProtocolRegion, Confidence } from '../types/index';
import demoRegion from '../data/protocols/demoRegion.json';
import { getCustomRegions } from './protocolIngestion';

const STORAGE_KEY = 'emt-protocol-region';

const NO_PROTOCOL: ProtocolRegion = { regionName: 'No Protocol Loaded', protocols: [] };
const BUILT_IN: Record<string, ProtocolRegion> = {
  demo: demoRegion as ProtocolRegion,
  none: NO_PROTOCOL,
};

function getAllRegions(): Record<string, ProtocolRegion> {
  const custom = getCustomRegions();
  return { ...BUILT_IN, ...custom };
}

let region: ProtocolRegion;

function loadRegion(): ProtocolRegion {
  const saved = localStorage.getItem(STORAGE_KEY);
  const all = getAllRegions();
  return all[saved ?? 'demo'] ?? all.demo;
}

region = loadRegion();

export function setActiveRegion(id: string) {
  localStorage.setItem(STORAGE_KEY, id);
  region = getAllRegions()[id] ?? BUILT_IN.demo;
}

export function getActiveRegionId(): string {
  return localStorage.getItem(STORAGE_KEY) ?? 'demo';
}

export function getActiveRegionName(): string {
  return region.regionName;
}

export function getActiveRegionMeta(): {
  id: string;
  name: string;
  version?: string;
  effectiveDate?: string;
  sourceOrganization?: string;
  sourceUrl?: string;
  sourceType?: string;
  importedAt?: string;
  confidence: Confidence;
  protocolCount: number;
} {
  return {
    id: getActiveRegionId(),
    name: region.regionName,
    version: region.version,
    effectiveDate: region.effectiveDate,
    sourceOrganization: region.sourceOrganization,
    sourceUrl: region.sourceUrl,
    sourceType: region.sourceType,
    importedAt: region.importedAt,
    confidence: region.confidence ?? 'high',
    protocolCount: region.protocols.length,
  };
}

export function getProtocolQualifier(): string {
  const id = getActiveRegionId();
  if (id === 'none') return 'generic support only';
  const conf = region.confidence ?? 'high';
  if (conf === 'high') return 'per loaded protocol';
  return 'verify per local protocol';
}

export function getAvailableRegions(): { id: string; name: string; version?: string; protocolCount: number; isCustom: boolean }[] {
  const all = getAllRegions();
  return Object.entries(all).map(([id, r]) => ({
    id,
    name: r.regionName,
    version: r.version,
    protocolCount: r.protocols.length,
    isCustom: !(id in BUILT_IN),
  }));
}

let matchedProtocols: Set<string>;
let emittedRedFlags: Set<string>;
let givenMessages: Set<string>;

export function resetGuidanceState() {
  region = loadRegion();
  matchedProtocols = new Set();
  emittedRedFlags = new Set();
  givenMessages = new Set();
}

resetGuidanceState();

function makeEntry(text: string, type: GuidanceEntry['type'], protocolSection?: string): GuidanceEntry {
  return { id: crypto.randomUUID(), timestamp: Date.now(), text, type, ...(protocolSection && { protocolSection }) };
}

function emit(text: string, type: GuidanceEntry['type'], results: GuidanceEntry[], protocolSection?: string) {
  if (!givenMessages.has(text)) {
    givenMessages.add(text);
    const display = text.length > 100 ? text.substring(0, 97) + '...' : text;
    results.push(makeEntry(display, type, protocolSection));
  }
}

function matchesProtocol(text: string, protocol: Protocol): boolean {
  const lower = text.toLowerCase();
  return protocol.triggerKeywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function sanitize(text: string): string {
  return text
    .replace(/^Administer\b/i, 'Consider')
    .replace(/^Give\b/i, 'Consider')
    .replace(/^Start\b/i, 'Consider starting')
    .replace(/^Initiate\b/i, 'Consider initiating')
    .replace(/\bYou must\b/gi, 'consider')
    .replace(/\bDiagnosis is\b/gi, 'differential includes');
}

function isFieldDocumented(need: string, snapshot: CallSnapshot): boolean | null {
  const lower = need.toLowerCase();
  if (lower.includes('age') || lower.includes('sex') || lower.includes('demograph')) return !!(snapshot.patientAge || snapshot.patientSex);
  if (lower.includes('chief') || lower.includes('complaint') || lower.includes('presenting')) return !!snapshot.chiefComplaint;
  if (lower.includes('vital')) return !!snapshot.vitals;
  if (lower.includes('allerg')) return !!snapshot.allergies;
  if (lower.includes('medicat')) return !!snapshot.medications;
  if (lower.includes('history') || lower.includes('pmh')) return !!snapshot.pastMedicalHistory;
  if (lower.includes('treatment') || lower.includes('intervention')) return !!snapshot.treatmentsGiven;
  if (lower.includes('response')) return !!snapshot.responseToTreatment;
  if (lower.includes('mental') || lower.includes('gcs') || lower.includes('consciousness') || lower.includes('neuro')) return !!snapshot.mentalStatus;
  if (lower.includes('finding') || lower.includes('assessment') || lower.includes('exam')) return !!snapshot.assessmentFindings;
  if (lower.includes('destination') || lower.includes('transport') || lower.includes('facility')) return !!snapshot.destination;
  if (lower.includes('eta') || lower.includes('arrival')) return !!snapshot.eta;
  return null;
}

function getDocumentationGaps(needs: string[], snapshot: CallSnapshot): string[] {
  const gaps: string[] = [];
  for (const need of needs) {
    const documented = isFieldDocumented(need, snapshot);
    if (documented === false) gaps.push(need);
  }
  return gaps;
}

function extractRedFlagKeywords(flag: string): string[] {
  const words = flag.toLowerCase()
    .replace(/[—–\-,;()]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .filter((w) => !['contact', 'consider', 'medical', 'direction', 'immediately', 'protocol', 'regional', 'signs'].includes(w));
  return words.slice(0, 4);
}

function checkRedFlags(statement: string, protocol: Protocol, results: GuidanceEntry[]) {
  const lower = statement.toLowerCase();
  for (const flag of protocol.redFlags) {
    if (emittedRedFlags.has(flag)) continue;
    const keywords = extractRedFlagKeywords(flag);
    const matched = keywords.filter((kw) => lower.includes(kw));
    if (matched.length >= 2) {
      emittedRedFlags.add(flag);
      emit(`⚠ ${flag}`, 'safety', results, protocol.name);
    }
  }
}

export function getInitialGuidance(): GuidanceEntry[] {
  const results: GuidanceEntry[] = [];
  results.push(makeEntry('Ready. Need age, chief complaint, and mental status.', 'prompt'));

  const id = getActiveRegionId();
  if (id === 'none') {
    results.push(makeEntry('No protocol loaded — generic support only.', 'warning'));
  } else {
    const conf = region.confidence ?? 'high';
    if (conf === 'low') {
      results.push(makeEntry(
        `${region.regionName} loaded (low confidence). Verify all guidance per local protocol and medical direction.`,
        'safety',
      ));
    } else if (conf === 'medium') {
      results.push(makeEntry(
        `${region.regionName} loaded (medium confidence). Verify guidance per local protocol.`,
        'protocol_reminder',
      ));
    }
  }

  return results;
}

export function analyzeNewStatement(statement: string, snapshot: CallSnapshot): GuidanceEntry[] {
  const results: GuidanceEntry[] = [];
  const qualifier = getProtocolQualifier();
  const combined = `${statement} ${snapshot.chiefComplaint ?? ''}`;
  const missingLower = new Set(snapshot.missingItems.map(s => s.toLowerCase()));
  let anyMatched = false;

  for (const protocol of region.protocols) {
    if (!matchesProtocol(combined, protocol)) continue;
    anyMatched = true;

    if (!matchedProtocols.has(protocol.id)) {
      matchedProtocols.add(protocol.id);

      const conf = region.confidence ?? 'high';
      if (conf !== 'high') {
        emit(`${protocol.name} matched — ${qualifier}.`, 'protocol_reminder', results, protocol.name);
      }

      for (const action of protocol.suggestedActions) {
        emit(sanitize(action), 'protocol', results, protocol.name);
      }

      const assessItems = (protocol.assessmentItems ?? (protocol as any).keyAssessmentItems ?? []) as string[];
      if (assessItems.length > 0) {
        const hint = assessItems.slice(0, 3).join(', ');
        emit(`Consider for ${protocol.name}: ${hint}.`, 'protocol_reminder', results, protocol.name);
      }

      if (protocol.medicalDirectionRequired?.length) {
        for (const req of protocol.medicalDirectionRequired.slice(0, 2)) {
          emit(`Contact medical direction if required: ${req}`, 'protocol_reminder', results, protocol.name);
        }
      }
    }

    checkRedFlags(statement, protocol, results);

    if (snapshot.vitals || snapshot.treatmentsGiven) {
      const radioGaps = getDocumentationGaps(protocol.radioReportNeeds ?? [], snapshot)
        .filter(g => !missingLower.has(g.toLowerCase()));
      if (radioGaps.length > 0 && radioGaps.length <= 3) {
        emit(`Missing for radio report: ${radioGaps.join(', ')}.`, 'documentation', results, protocol.name);
      }
    }

    if (snapshot.chiefComplaint && (snapshot.vitals || snapshot.assessmentFindings)) {
      const pcrGaps = getDocumentationGaps(protocol.pcrDocumentationNeeds ?? [], snapshot)
        .filter(g => !missingLower.has(g.toLowerCase()));
      if (pcrGaps.length > 0 && pcrGaps.length <= 3) {
        emit(`Document for PCR: ${pcrGaps.join(', ')}.`, 'documentation', results, protocol.name);
      }
    }
  }

  if (!anyMatched && snapshot.chiefComplaint && matchedProtocols.size === 0 && region.protocols.length > 0) {
    emit(`No matching protocol section. Generic documentation support — ${qualifier}.`, 'protocol_reminder', results);
  }

  if (snapshot.chiefComplaint && !snapshot.vitals && !snapshot.mentalStatus) {
    emit('Consider: obtain OPQRST and SAMPLE if not already completed.', 'prompt', results);
  }

  if (snapshot.treatmentsGiven && !snapshot.responseToTreatment) {
    emit('Document: response to treatment for radio report.', 'prompt', results);
  }

  if (snapshot.chiefComplaint && snapshot.vitals && !snapshot.eta) {
    emit('Consider transport decision — document destination and ETA.', 'prompt', results);
  }

  if (snapshot.eta && snapshot.responseToTreatment) {
    emit(`Verify nothing missing before radio patch — ${qualifier}.`, 'prompt', results);
  }

  if (snapshot.missingItems.length > 0) {
    const missingText = `Missing: ${snapshot.missingItems.join(', ')}.`;
    if (!givenMessages.has(missingText)) {
      for (const key of [...givenMessages]) {
        if (key.startsWith('Missing:')) givenMessages.delete(key);
      }
      emit(missingText, 'missing_info', results);
    }
  }

  return results;
}

export function getMatchedProtocols(): Protocol[] {
  return region.protocols.filter((p) => matchedProtocols.has(p.id));
}

function v(value: string | null | undefined, fallback = '[not documented]'): string {
  return value || fallback;
}

// --- Radio Report ---

export function generateRadioReport(snapshot: CallSnapshot): string {
  const protocols = getMatchedProtocols();
  const protocolNames = protocols.map((p) => p.name).join(', ') || 'General';

  const patient = [snapshot.patientAge && `${snapshot.patientAge}-year-old`, snapshot.patientSex?.toLowerCase()]
    .filter(Boolean).join(' ') || '[age/sex not documented]';

  const historyParts: string[] = [];
  if (snapshot.pastMedicalHistory) historyParts.push(snapshot.pastMedicalHistory);
  if (snapshot.medications) historyParts.push(`on ${snapshot.medications}`);
  if (snapshot.allergies) {
    const isNegative = /^(nkda|nka|no known|none)/i.test(snapshot.allergies);
    historyParts.push(isNegative ? snapshot.allergies : `allergic to ${snapshot.allergies}`);
  }
  const history = historyParts.length > 0 ? historyParts.join(', ') : '[not documented]';

  const findingParts: string[] = [];
  if (snapshot.mentalStatus) findingParts.push(snapshot.mentalStatus);
  if (snapshot.assessmentFindings) findingParts.push(snapshot.assessmentFindings);
  const findings = findingParts.length > 0 ? findingParts.join(', ') : '[not documented]';

  const specialNeeds: string[] = [];
  for (const p of protocols) {
    if (p.medicalDirectionRequired?.length) {
      specialNeeds.push(...p.medicalDirectionRequired.slice(0, 2));
    }
  }

  const lines = [
    `RADIO REPORT — GENERATED DRAFT`,
    `Verify all details before transmitting.`,
    ``,
    `[Your unit ID] to ${v(snapshot.destination, '[destination]')},`,
    ``,
    `We are en route to your facility${snapshot.eta ? `, ETA ${snapshot.eta}` : ''} with a ${patient}`,
    `chief complaint of ${v(snapshot.chiefComplaint, '[chief complaint not documented]')}.`,
    ``,
    `Pertinent history: ${history}.`,
    ``,
    `Pertinent findings: ${findings}.`,
    ``,
    `Vitals: ${v(snapshot.vitalsLatest)}.`,
    ``,
    `Treatment: ${v(snapshot.treatmentsGiven)}.`,
    ``,
    `Response: ${v(snapshot.responseToTreatment)}.`,
    ``,
    `ETA: ${v(snapshot.eta)}.`,
    ...(specialNeeds.length > 0 ? [
      ``,
      `Special needs: ${specialNeeds.join('; ')}.`,
    ] : []),
    ``,
    `—`,
    `Protocol: ${protocolNames} (${region.regionName})`,
    ...(region.confidence && region.confidence !== 'high'
      ? [`Protocol confidence: ${region.confidence}. Verify all protocol references per your agency and medical direction.`]
      : []),
    `GENERATED DRAFT — verify per local protocol. Not a substitute for clinical judgment.`,
  ];

  return lines.join('\n');
}

// --- PCR Draft ---

export function generatePCR(snapshot: CallSnapshot, transcript: string): string {
  const protocols = getMatchedProtocols();
  const protocolNames = protocols.map((p) => p.name).join(', ') || 'General';
  const docNeeds = protocols.flatMap((p) => p.pcrDocumentationNeeds);
  const checklist = [...new Set(docNeeds)];

  const patient = [snapshot.patientAge && `${snapshot.patientAge}-year-old`, snapshot.patientSex?.toLowerCase()]
    .filter(Boolean).join(' ') || 'Patient';

  // Dispatch/scene
  const dispatchLine = `Dispatched for ${v(snapshot.chiefComplaint, 'a medical call')}.`;

  // Initial presentation
  const presentParts = [
    `On arrival, found ${patient}`,
    snapshot.chiefComplaint && `with chief complaint of ${snapshot.chiefComplaint}`,
    snapshot.mentalStatus && `(${snapshot.mentalStatus})`,
  ].filter(Boolean);
  const presentation = presentParts.join(' ') + '.';

  // History
  const hxLines: string[] = [];
  if (snapshot.pastMedicalHistory) hxLines.push(`PMH: ${snapshot.pastMedicalHistory}`);
  if (snapshot.medications) hxLines.push(`Medications: ${snapshot.medications}`);
  if (snapshot.allergies) hxLines.push(`Allergies: ${snapshot.allergies}`);

  // Assessment
  const assessLines: string[] = [];
  if (snapshot.mentalStatus) assessLines.push(`Mental status: ${snapshot.mentalStatus}`);
  if (snapshot.vitalsLatest) assessLines.push(`Vitals: ${snapshot.vitalsLatest}`);
  if (snapshot.assessmentFindings) assessLines.push(`Findings: ${snapshot.assessmentFindings}`);

  // Pertinent negatives — only when the related assessment was documented
  const negatives: string[] = [];
  const findings = (snapshot.assessmentFindings ?? '').toLowerCase();
  const fullTranscriptLower = transcript.toLowerCase();
  if (snapshot.chiefComplaint?.toLowerCase().includes('chest') && findings && !findings.includes('jvd')) {
    negatives.push('No JVD noted');
  }
  if (snapshot.chiefComplaint?.toLowerCase().includes('breath') && fullTranscriptLower.includes('lung sound') && !findings.includes('wheez')) {
    negatives.push('No wheezing on auscultation');
  }
  if (snapshot.mentalStatus && /alert|oriented|a.?ox/i.test(snapshot.mentalStatus)) {
    negatives.push('No altered mentation');
  }

  // Interventions
  const txLines = snapshot.treatmentsGiven
    ? snapshot.treatmentsGiven.split(';').map((t) => `- ${t.trim()}`)
    : ['- [No treatments documented]'];

  // Disposition
  const dispoParts = [
    snapshot.destination && `Transported to ${snapshot.destination}`,
    snapshot.eta && `ETA ${snapshot.eta}`,
  ].filter(Boolean);
  const disposition = dispoParts.length > 0 ? dispoParts.join(', ') + '.' : '[not documented]';

  const confNotice = region.confidence && region.confidence !== 'high'
    ? `Protocol confidence: ${region.confidence}. Verify all protocol references per your agency and medical direction.`
    : '';

  const lines = [
    `PRE-HOSPITAL CARE REPORT — GENERATED DRAFT`,
    `Review and verify all information before submission.`,
    `Protocol: ${protocolNames} (${region.regionName})`,
    ...(confNotice ? [confNotice] : []),
    ``,
    `DISPATCH / SCENE:`,
    dispatchLine,
    ``,
    `INITIAL PRESENTATION:`,
    presentation,
    ``,
    `HISTORY:`,
    ...(hxLines.length > 0 ? hxLines : ['[not documented]']),
    ``,
    `ASSESSMENT FINDINGS:`,
    ...(assessLines.length > 0 ? assessLines : ['[Review and complete based on clinical findings]']),
    ``,
    ...(negatives.length > 0 ? [
      `PERTINENT NEGATIVES:`,
      ...negatives.map((n) => `- ${n}`),
      ``,
    ] : []),
    `VITALS TREND:`,
    ...(snapshot.vitalsTrend.length > 0
      ? snapshot.vitalsTrend.map((vt, i) => `${i === 0 ? 'Initial' : `Set ${i + 1}`}: ${vt}`)
      : [snapshot.vitalsLatest ? `Initial: ${snapshot.vitalsLatest}` : '[not documented]']),
    ``,
    `INTERVENTIONS:`,
    ...txLines,
    ``,
    `RESPONSE TO INTERVENTIONS:`,
    v(snapshot.responseToTreatment),
    ``,
    `TRANSPORT / DISPOSITION:`,
    disposition,
    ``,
    `HANDOFF:`,
    `Patient care transferred to [receiving facility staff] with verbal report.`,
    ``,
    `TRANSCRIPT REFERENCE:`,
    transcript,
    ``,
    ...(checklist.length > 0 ? [
      `DOCUMENTATION CHECKLIST:`,
      ...checklist.map((n) => `☐ ${n}`),
      ``,
    ] : []),
    `—`,
    `GENERATED DRAFT — not a substitute for clinical judgment or agency policy.`,
    `The treating EMT is responsible for accuracy and completeness of the final PCR.`,
  ];

  return lines.join('\n');
}

export function generateDebrief(snapshot: CallSnapshot): string {
  const protocols = getMatchedProtocols();
  const protocolNames = protocols.map((p) => p.name).join(', ') || 'General';
  const missingSet = new Set(snapshot.missingItems.map(s => s.toLowerCase()));

  const allFields: [string, boolean][] = [
    ['Patient demographics', !!(snapshot.patientAge || snapshot.patientSex)],
    ['Chief complaint', !!snapshot.chiefComplaint],
    ['Vitals', !!snapshot.vitalsLatest],
    ['Allergies', !!snapshot.allergies],
    ['Medications', !!snapshot.medications],
    ['Past medical history', !!snapshot.pastMedicalHistory],
    ['Mental status', !!snapshot.mentalStatus],
    ['Treatments given', !!snapshot.treatmentsGiven],
    ['Response to treatment', !!snapshot.responseToTreatment],
    ['ETA', !!snapshot.eta],
    ['Destination', !!snapshot.destination],
    ['Assessment findings', !!snapshot.assessmentFindings],
  ];

  const documented = allFields.filter(([, present]) => present).map(([label]) => label);

  const missing = snapshot.missingItems.length > 0
    ? snapshot.missingItems
    : ['None — all key fields captured'];

  const protocolReminders: string[] = [];
  for (const p of protocols) {
    const items = p.assessmentItems ?? p.keyAssessmentItems ?? [];
    for (const item of items) {
      protocolReminders.push(`${p.name}: ${item}`);
    }
  }

  const improvements: string[] = [];
  if (snapshot.missingItems.length > 0) {
    improvements.push(`Capture ${snapshot.missingItems.join(', ')} earlier in the call.`);
  }
  if (missingSet.has('treatment response') && snapshot.treatmentsGiven) {
    improvements.push('Document response after each treatment for stronger radio report.');
  }
  if (missingSet.has('mental status')) {
    improvements.push('Include mental status (GCS or alert/oriented) in initial assessment.');
  }
  if (improvements.length === 0) {
    improvements.push('Good documentation overall. Continue current practice.');
  }

  const lines = [
    `CALL DEBRIEF — DRAFT`,
    `Protocol: ${protocolNames} (${region.regionName})`,
    ``,
    `DOCUMENTED WELL:`,
    ...documented.map((d) => `  ✓ ${d}`),
    ``,
    `MISSING OR WEAK DOCUMENTATION:`,
    ...missing.map((m) => `  ✗ ${m}`),
    ``,
    ...(protocolReminders.length > 0 ? [
      `PROTOCOL REMINDERS:`,
      ...protocolReminders.map((r) => `  - ${r}`),
      ``,
    ] : []),
    `SUGGESTED IMPROVEMENTS:`,
    ...improvements.map((i) => `  → ${i}`),
    ``,
    `---`,
    `GENERATED DRAFT — not a substitute for formal QA/QI review.`,
    `Use as a starting point for team debrief discussion.`,
  ];

  return lines.join('\n');
}
