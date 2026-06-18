import type { CallSnapshot, ClinicalFacts } from '../types/index';

export function createEmptySnapshot(): CallSnapshot {
  return {
    patientAge: null,
    patientSex: null,
    chiefComplaint: null,
    mentalStatus: null,
    vitals: null,
    vitalsLatest: null,
    vitalsTrend: [],
    allergies: null,
    medications: null,
    pastMedicalHistory: null,
    assessmentFindings: null,
    treatmentsGiven: null,
    responseToTreatment: null,
    suspectedDifferentials: [],
    destination: null,
    eta: null,
    protocolFlags: [],
    pertinentNegatives: [],
    missingItems: [],
  };
}

function first(text: string, regex: RegExp): string | null {
  const m = text.match(regex);
  return m ? m[1] ?? m[0] : null;
}

function append(existing: string | null, addition: string): string {
  if (!existing) return addition;
  if (existing.includes(addition)) return existing;
  return `${existing}; ${addition}`;
}

// --- Individual extractors ---

function extractAge(s: string, snap: CallSnapshot): CallSnapshot {
  const m = s.match(/\b(\d{1,3})\s*[-–]?\s*(year|yr|y\.?o\.?)/i);
  if (m) return { ...snap, patientAge: m[1] };
  const m2 = s.match(/\bage\s+(\d{1,3})\b/i);
  if (m2) return { ...snap, patientAge: m2[1] };
  return snap;
}

function extractSex(s: string, snap: CallSnapshot): CallSnapshot {
  const m = first(s, /\b(male|female|man|woman)\b/i);
  if (m) return { ...snap, patientSex: m.charAt(0).toUpperCase() + m.slice(1).toLowerCase() };
  return snap;
}

function extractChiefComplaint(s: string, snap: CallSnapshot): CallSnapshot {
  const patterns = [
    /complain(?:ing|t|s)?\s+of\s+(.+?)(?:\.|,|$)/i,
    /chief complaint[:\s]+(.+?)(?:\.|,|$)/i,
    /c\/c[:\s]+(.+?)(?:\.|,|$)/i,
    /present(?:ing|s)?\s+with\s+(.+?)(?:\.|,|$)/i,
    /(?:called|responding|dispatched)\s+for\s+(?:a\s+)?(?:\d+.year.old\s+\w+\s+(?:with|who\s+has)\s+)?(.+?)(?:\.|,|$)/i,
  ];
  for (const p of patterns) {
    const m = first(s, p);
    if (m) return { ...snap, chiefComplaint: m.trim() };
  }
  if (!snap.chiefComplaint) {
    const keywords = [
      'chest pain', 'chest tightness', 'substernal pain',
      'shortness of breath', 'difficulty breathing', 'respiratory distress',
      'abdominal pain', 'back pain', 'headache', 'hip pain',
      'altered mental status', 'unresponsive', 'seizure',
      'allergic reaction', 'anaphylaxis', 'throat tightness',
      'right-sided weakness', 'left-sided weakness',
      'syncope', 'dizziness', 'fall',
    ];
    const lower = s.toLowerCase();
    for (const kw of keywords) {
      if (lower.includes(kw)) return { ...snap, chiefComplaint: kw };
    }
  }
  return snap;
}

function extractMentalStatus(s: string, snap: CallSnapshot): CallSnapshot {
  const phrase = first(s, /\b(alert\s+and\s+oriented(?:\s+(?:x\s*\d|times\s+\d))?|gcs\s*(?:of\s+)?\d+)/i);
  if (phrase) return { ...snap, mentalStatus: append(snap.mentalStatus, phrase) };
  const m = first(s, /\b(alert|oriented|confused|unresponsive|lethargic|agitated|a[&+]?ox[1-4]|aox[1-4]|anxious|postictal|conscious|disoriented)\b/i);
  if (m) return { ...snap, mentalStatus: append(snap.mentalStatus, m) };
  return snap;
}

function mergeVitals(existing: string | null, parts: string[]): string {
  const merged = existing ? existing.split(' | ') : [];
  for (const p of parts) {
    const label = p.split(' ')[0];
    const idx = merged.findIndex(v => v.startsWith(label));
    if (idx >= 0) merged[idx] = p;
    else merged.push(p);
  }
  return merged.join(' | ');
}

function extractVitals(s: string, snap: CallSnapshot): CallSnapshot {
  const parts: string[] = [];

  const bp = s.match(/\b(?:bp|blood pressure)(?:\s+(?:(?:is|of|was|at|now|reads?)\s+|(?:down|up|improving|improved|decreased|increased)\s+to\s+)?|\s*:\s*)(\d{2,3}\s*(?:over|\/)\s*\d{2,3})\b/i);
  if (bp) parts.push(`BP ${bp[1].replace(/\s*over\s*/i, '/')}`);

  const hr = s.match(/\b(?:pulse|heart rate|hr)(?:\s+(?:(?:is|of|was|at|now|reads?)\s+|(?:down|up|improving|improved|decreased|increased)\s+to\s+)?|\s*:\s*)(\d{2,3})\b/i);
  if (hr) parts.push(`HR ${hr[1]}`);

  const rr = s.match(/\b(?:resp(?:irat(?:ion|ory))?s?|respiratory rate|rr)(?:\s+(?:(?:is|of|was|at|now|reads?)\s+|(?:down|up|improving|improved|decreased|increased)\s+to\s+)?|\s*:\s*)(\d{1,2})\b/i);
  if (rr) parts.push(`RR ${rr[1]}`);

  const spo2 = s.match(/\b(?:spo2|o2 sat|oxygen saturation|sats?)(?:\s+(?:(?:is|of|was|at|now|reads?)\s+|(?:down|up|improving|improved|decreased|increased)\s+to\s+)?|\s*:\s*)(\d{2,3})\s*(?:%|percent)?\b/i);
  if (spo2) parts.push(`SpO2 ${spo2[1]}%`);

  const gcs = s.match(/\bgcs(?:\s+(?:(?:is|of|was|at|now)\s+)?)(\d{1,2})\b/i);
  if (gcs) parts.push(`GCS ${gcs[1]}`);

  const glucose = s.match(/\b(?:blood glucose|blood sugar|bgl|glucose)(?:\s+(?:(?:is|of|was|at|now|reads?)\s+|(?:down|up|improving|improved|decreased|increased)\s+to\s+)?|\s*:\s*)(\d{2,3})\b/i);
  if (glucose) parts.push(`BGL ${glucose[1]}`);

  const temp = s.match(/\b(?:temp(?:erature)?)(?:\s+(?:(?:is|of|was|at|now|reads?)\s+|(?:down|up|improving|improved|decreased|increased)\s+to\s+)?|\s*:\s*)(\d{2,3}(?:\.\d)?)\b/i);
  if (temp) parts.push(`Temp ${temp[1]}`);

  if (parts.length > 0) {
    const merged = mergeVitals(snap.vitals, parts);
    return {
      ...snap,
      vitals: merged,
      vitalsLatest: merged,
      vitalsTrend: [...snap.vitalsTrend, parts.join(' | ')],
    };
  }
  return snap;
}

function extractAllergies(s: string, snap: CallSnapshot): CallSnapshot {
  if (/\b(nkda|nka)\b/i.test(s)) return { ...snap, allergies: 'NKDA' };
  if (/\b(?:no known (?:drug )?allergies|no allergies|denies (?:any )?allergies)\b/i.test(s))
    return { ...snap, allergies: 'No known allergies' };
  const m = s.match(/\ballergic to\s+(.+?)(?:\.|,\s*(?!and)|$)/i);
  if (m) return { ...snap, allergies: append(snap.allergies, m[1].trim()) };
  return snap;
}

function extractMedications(s: string, snap: CallSnapshot): CallSnapshot {
  if (/\b(?:no meds|no medications|denies (?:any )?medications?)\b/i.test(s))
    return { ...snap, medications: 'None' };
  const m = s.match(/\btakes?\s+(.+?)(?:\.\s|\.$|$)/i);
  if (m) return { ...snap, medications: append(snap.medications, m[1].replace(/\.$/, '').trim()) };
  const onMed = s.match(/\bon\s+((?:blood thinners|insulin|dialysis|oxygen|(?:a\s+)?(?:beta.?blocker|ace.?inhibitor|statin|anticoagulant|anti.?platelet))(?:\s+and\s+\S+)?)\b/i);
  if (onMed) return { ...snap, medications: append(snap.medications, onMed[1].trim()) };
  if (/\b(?:gave|admin|started|applied|obtained|performed|after)\b/i.test(s) && !/\btakes?\b/i.test(s)) return snap;
  const meds = s.match(/\b(lisinopril|metoprolol|aspirin|atenolol|amlodipine|metformin|insulin|albuterol|nitroglycerin|warfarin|eliquis|xarelto|plavix|lasix|prednisone|furosemide|levetiracetam|midazolam)\b/gi);
  if (meds && meds.length > 0) {
    const unique = [...new Set(meds.map((x) => x.toLowerCase()))];
    return { ...snap, medications: append(snap.medications, unique.join(', ')) };
  }
  return snap;
}

function extractPMH(s: string, snap: CallSnapshot): CallSnapshot {
  if (/\b(?:no (?:past )?medical history|no (?:significant )?pmh|denies (?:any )?(?:medical )?history)\b/i.test(s))
    return { ...snap, pastMedicalHistory: 'None' };
  const m = s.match(/\b(?:past )?history of\s+(.+?)(?:\.\s|$)/i);
  if (m) return { ...snap, pastMedicalHistory: append(snap.pastMedicalHistory, m[1].trim()) };
  const namedHx = s.match(/\b(cardiac|pulmonary|respiratory|surgical|psychiatric)\s+history\b/i);
  if (namedHx) return { ...snap, pastMedicalHistory: append(snap.pastMedicalHistory, namedHx[0]) };
  const conditions = s.match(/\b(hypertension|diabetes|copd|asthma|chf|cad|afib|a-fib|seizure disorder|renal|dialysis|cancer|stroke|mi|myocardial infarction|cabg|heart failure|htn|ckd|dvt|pe)\b/gi);
  if (conditions && conditions.length > 0) {
    const unique = [...new Set(conditions.map((x) => x.toLowerCase()))];
    return { ...snap, pastMedicalHistory: append(snap.pastMedicalHistory, unique.join(', ')) };
  }
  return snap;
}

function extractAssessment(s: string, snap: CallSnapshot): CallSnapshot {
  const findings = s.match(/\b(diaphoretic|cyanotic|pale|jvd|edema|diminished|crackles|wheezes|rhonchi|guarding|distended|deformity|tenderness|ecchymosis)\b/gi);
  if (findings && findings.length > 0) {
    const unique = [...new Set(findings.map((x) => x.toLowerCase()))];
    return { ...snap, assessmentFindings: append(snap.assessmentFindings, unique.join(', ')) };
  }
  return snap;
}

function extractPertinentNegatives(s: string, snap: CallSnapshot): CallSnapshot {
  const negatives = [...snap.pertinentNegatives];
  const lower = s.toLowerCase();

  const explicit: [RegExp, string][] = [
    [/\bno\s+loss of consciousness\b/i, 'No loss of consciousness'],
    [/\bno\s+loc\b/i, 'No LOC'],
    [/\bno\s+facial droop\b/i, 'No facial droop'],
    [/\bno\s+arm drift\b/i, 'No arm drift'],
    [/\bno\s+facial droop\s+or\s+arm drift\b/i, 'No arm drift'],
    [/\bno\s+acute\s+ST\s+(?:changes?|elevation)\b/i, 'No acute ST changes'],
    [/\bno\s+(?:jvd|jugular venous distension)\b/i, 'No JVD'],
    [/\bno\s+wheezing\b/i, 'No wheezing'],
    [/\bno\s+edema\b/i, 'No edema'],
    [/\bno\s+crepitus\b/i, 'No crepitus'],
    [/\bno\s+(?:known )?cardiac history\b/i, 'No known cardiac history'],
    [/\bno\s+(?:known )?seizure (?:history|disorder)\b/i, 'No known seizure history'],
    [/\bno\s+(?:other )?allergies\b/i, 'No other allergies'],
    [/\bno\s+changes?\s+in\s+neuro\s+status\b/i, 'No change in neuro status'],
  ];

  for (const [pattern, label] of explicit) {
    if (pattern.test(s) && !negatives.some(n => n.toLowerCase() === label.toLowerCase())) {
      negatives.push(label);
    }
  }

  if (/\bpupils?\s+(?:are\s+)?equal\s+and\s+reactive\b/i.test(s)) {
    const label = 'Pupils equal and reactive';
    if (!negatives.some(n => n.toLowerCase() === label.toLowerCase())) negatives.push(label);
  }

  const denyMatch = s.match(/\bdenies\s+(.+?)(?:\.|,|;|$)/i);
  if (denyMatch) {
    const label = `Denies ${denyMatch[1].trim()}`;
    if (!negatives.some(n => n.toLowerCase() === label.toLowerCase())) negatives.push(label);
  }

  if (/\brefusing transport\b/i.test(lower)) {
    const label = 'Refusing transport';
    if (!negatives.some(n => n.toLowerCase() === label.toLowerCase())) negatives.push(label);
  }

  return negatives.length > snap.pertinentNegatives.length
    ? { ...snap, pertinentNegatives: negatives }
    : snap;
}

function cleanTreatment(raw: string): string | null {
  let t = raw.replace(/^(?:a|an|the)\s+/i, '').trim();
  if (/^\d+\s*(minutes?|hours?|seconds?|days?)\b/i.test(t)) return null;
  if (/^about\s/i.test(t)) return null;
  if (t.length < 2) return null;
  return t;
}

function extractTreatments(s: string, snap: CallSnapshot): CallSnapshot {
  let result = snap.treatmentsGiven;

  for (const m of s.matchAll(/\b(?:gave|administered|applied|obtained|performed)\s+(.+?)(?:\.|,\s*(?!and)|;|$)/gi)) {
    const t = cleanTreatment(m[1]);
    if (t) result = append(result, t);
  }

  for (const m of s.matchAll(/\bstarted\s+(.+?)(?:\.|,\s*(?!and)|;|$)/gi)) {
    const t = cleanTreatment(m[1]);
    if (t && !/^\d/.test(t) && !/^(?:about|approximately|around)\b/i.test(t)) {
      result = append(result, t);
    }
  }

  if (/\b(?:gave|admin|establish|started|applied|obtain|perform|used|activated)/i.test(s)) {
    const found = s.match(/\b(oxygen|o2|iv|iv access|12.lead|splint|bandage|cpr|bvm|suction|epi(?:nephrine)?|narcan|naloxone|nitro(?:glycerin)?|albuterol|glucose|dextrose|pelvic binder|normal saline|nasal cannula|cpap|nebulizer|tourniquet)\b/gi);
    if (found) {
      const unique = [...new Set(found.map(x => x.toLowerCase()))];
      for (const t of unique) {
        if (!result?.toLowerCase().includes(t)) result = append(result, t);
      }
    }
  }

  return result !== snap.treatmentsGiven ? { ...snap, treatmentsGiven: result } : snap;
}

function extractResponse(s: string, snap: CallSnapshot): CallSnapshot {
  const m = first(s, /\b(pain (?:decreased|increased|unchanged)|improv(?:ed|ing)|no (?:change|improvement)|respond(?:ed|ing) (?:well|poorly)|better|worse|stable|no effect|relief)\b/i);
  if (m) return { ...snap, responseToTreatment: append(snap.responseToTreatment, m) };
  const m2 = s.match(/decreased to\s+(.+?)(?:\.|$)/i);
  if (m2) return { ...snap, responseToTreatment: append(snap.responseToTreatment, `decreased to ${m2[1].trim()}`) };
  return snap;
}

function extractDestination(s: string, snap: CallSnapshot): CallSnapshot {
  const m = s.match(/\b(?:transport(?:ing)? to|en route to|heading to|destination)\s+(.+?)(?:\.|,|$)/i);
  if (m) return { ...snap, destination: m[1].trim() };
  const hospital = s.match(/\b((?:St\.?\s+)?(?:[A-Z][a-z]+(?:'s)?)\s+(?:Hospital|Medical Center|Memorial|General|Regional|Community))\b/);
  if (hospital) return { ...snap, destination: hospital[1] };
  return snap;
}

function normalizeETA(raw: string): string {
  const n = raw.replace(/\s+/g, ' ').trim();
  if (/min/i.test(n)) return n;
  return `${n} min`;
}

function extractETA(s: string, snap: CallSnapshot): CallSnapshot {
  const m = s.match(/\b(?:eta|estimated)\s*(?:of|is|:)?\s*(?:approximately\s+)?(\d{1,3}\s*(?:min(?:ute)?s?)?)\b/i);
  if (m) return { ...snap, eta: normalizeETA(m[1]) };
  const m2 = s.match(/\bapproximately\s+(\d{1,3})\s*min(?:ute)?s?\b/i);
  if (m2) return { ...snap, eta: `${m2[1]} min` };
  const m3 = s.match(/\b(?:about|around|roughly)?\s*(\d{1,3})\s*min(?:ute)?s?\s+out\b/i);
  if (m3) return { ...snap, eta: `${m3[1]} min` };
  const m4 = s.match(/\b(?:we(?:'re| are)|I'm|arriving|destination)\s+(?:about\s+|around\s+)?(?:in\s+)?(\d{1,3})\s*min(?:ute)?s?\s*(?:out|away)?\b/i);
  if (m4) return { ...snap, eta: `${m4[1]} min` };
  const m5 = s.match(/\b(?:arriving|arrive)\s+in\s+(?:about\s+|approximately\s+)?(\d{1,3})\s*min(?:ute)?s?\b/i);
  if (m5) return { ...snap, eta: `${m5[1]} min` };
  const m6 = s.match(/\bdestination\s+in\s+(?:about\s+|approximately\s+)?(\d{1,3})\s*min(?:ute)?s?\b/i);
  if (m6) return { ...snap, eta: `${m6[1]} min` };
  return snap;
}

function inferDifferentials(snap: CallSnapshot): string[] {
  const diffs: string[] = [];
  const cc = (snap.chiefComplaint ?? '').toLowerCase();
  const findings = (snap.assessmentFindings ?? '').toLowerCase();

  if (cc.includes('chest pain') || cc.includes('chest')) {
    diffs.push('ACS / MI');
    if (findings.includes('jvd') || findings.includes('crackles')) diffs.push('CHF');
    diffs.push('Angina', 'PE', 'Musculoskeletal');
  }
  if (cc.includes('breath') || cc.includes('dyspnea') || cc.includes('respiratory')) {
    diffs.push('Asthma/COPD exacerbation', 'CHF', 'Pneumonia', 'PE');
  }
  if (cc.includes('altered') || cc.includes('confused') || cc.includes('unresponsive')) {
    diffs.push('Hypoglycemia', 'Stroke/CVA', 'Overdose', 'Seizure (postictal)');
  }
  if (cc.includes('trauma') || cc.includes('fall') || cc.includes('accident')) {
    diffs.push('Fracture', 'Internal hemorrhage', 'TBI');
  }
  if (cc.includes('allergic') || cc.includes('anaphylaxis') || cc.includes('hives')) {
    diffs.push('Anaphylaxis', 'Urticaria', 'Angioedema');
  }

  return [...new Set(diffs)];
}

function inferProtocolFlags(snap: CallSnapshot): string[] {
  const flags: string[] = [];
  const cc = (snap.chiefComplaint ?? '').toLowerCase();

  if (cc.includes('chest pain') || cc.includes('chest')) flags.push('Chest Pain / ACS');
  if (cc.includes('breath') || cc.includes('dyspnea')) flags.push('Respiratory Distress');
  if (cc.includes('altered') || cc.includes('unresponsive') || cc.includes('stroke')) flags.push('Altered Mental Status');
  if (cc.includes('trauma') || cc.includes('fall') || cc.includes('accident')) flags.push('Trauma');
  if (cc.includes('allergic') || cc.includes('anaphylaxis')) flags.push('Allergic Reaction');

  return [...new Set(flags)];
}

export function normalizeMissingItems(items: string[]): string[] {
  const CANONICAL: Record<string, string> = {
    'age': 'Age',
    'sex': 'Sex',
    'chief complaint': 'Chief complaint',
    'cc': 'Chief complaint',
    'vitals': 'Vitals',
    'allergies': 'Allergies',
    'medications': 'Medications',
    'meds': 'Medications',
    'past medical history': 'Past medical history',
    'pmh': 'Past medical history',
    'mental status': 'Mental status',
    'eta': 'ETA',
    'treatment response': 'Treatment response',
  };
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const label = CANONICAL[item.toLowerCase()] ?? item;
    if (!seen.has(label)) {
      seen.add(label);
      result.push(label);
    }
  }
  return result;
}

function computeMissing(facts: ClinicalFacts): string[] {
  const missing: string[] = [];
  if (!facts.patientAge) missing.push('Age');
  if (!facts.patientSex) missing.push('Sex');
  if (!facts.chiefComplaint) missing.push('Chief complaint');
  if (!facts.vitalsLatest) missing.push('Vitals');
  if (!facts.allergies) missing.push('Allergies');
  if (!facts.medications) missing.push('Medications');
  if (!facts.pastMedicalHistory) missing.push('Past medical history');

  if (facts.chiefComplaint && !facts.mentalStatus) missing.push('Mental status');
  if (facts.treatmentsGiven && !facts.responseToTreatment) missing.push('Treatment response');
  if (facts.vitalsLatest && !facts.eta) missing.push('ETA');

  return normalizeMissingItems(missing);
}

export function extractFromStatement(statement: string, current: CallSnapshot): CallSnapshot {
  let snap = {
    ...current,
    vitalsTrend: [...current.vitalsTrend],
    pertinentNegatives: [...current.pertinentNegatives],
    suspectedDifferentials: [...current.suspectedDifferentials],
    protocolFlags: [...current.protocolFlags],
  };

  snap = extractAge(statement, snap);
  snap = extractSex(statement, snap);
  snap = extractChiefComplaint(statement, snap);
  snap = extractMentalStatus(statement, snap);
  snap = extractVitals(statement, snap);
  snap = extractAllergies(statement, snap);
  snap = extractMedications(statement, snap);
  snap = extractPMH(statement, snap);
  snap = extractAssessment(statement, snap);
  snap = extractPertinentNegatives(statement, snap);
  snap = extractTreatments(statement, snap);
  snap = extractResponse(statement, snap);
  snap = extractDestination(statement, snap);
  snap = extractETA(statement, snap);

  snap.suspectedDifferentials = inferDifferentials(snap);
  snap.protocolFlags = inferProtocolFlags(snap);
  snap.missingItems = computeMissing(snapshotToClinicalFacts(snap));

  return snap;
}

export function snapshotToClinicalFacts(snap: CallSnapshot): ClinicalFacts {
  return {
    patientAge: snap.patientAge,
    patientSex: snap.patientSex,
    chiefComplaint: snap.chiefComplaint,
    mentalStatus: snap.mentalStatus,
    allergies: snap.allergies,
    medications: snap.medications,
    pastMedicalHistory: snap.pastMedicalHistory,
    vitalsLatest: snap.vitalsLatest,
    vitalsTrend: snap.vitalsTrend,
    treatmentsGiven: snap.treatmentsGiven,
    responseToTreatment: snap.responseToTreatment,
    destination: snap.destination,
    eta: snap.eta,
    assessmentFindings: snap.assessmentFindings,
    pertinentNegatives: snap.pertinentNegatives,
    missingItems: snap.missingItems,
  };
}

export function transcriptToClinicalFacts(messages: string[], existingSnapshot?: CallSnapshot): ClinicalFacts {
  let snap = existingSnapshot
    ? { ...existingSnapshot, vitalsTrend: [], pertinentNegatives: [], suspectedDifferentials: [], protocolFlags: [], missingItems: [] }
    : createEmptySnapshot();
  for (const msg of messages) {
    snap = extractFromStatement(msg, snap);
  }
  return snapshotToClinicalFacts(snap);
}
