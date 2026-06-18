// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  createEmptySnapshot,
  extractFromStatement,
  transcriptToClinicalFacts,
} from './extractionService';
import {
  resetGuidanceState,
  analyzeNewStatement,
  generateRadioReport,
  generatePCR,
  generateDebrief,
} from './guidanceEngine';
import { TEST_SCENARIOS } from '../data/testScenarios';
import type { CallSnapshot, GuidanceEntry } from '../types/index';

function buildSnapshot(statements: string[]): CallSnapshot {
  let snap = createEmptySnapshot();
  for (const s of statements) {
    snap = extractFromStatement(s, snap);
  }
  return snap;
}

function simulateCall(statements: string[]): {
  snapshot: CallSnapshot;
  allGuidance: GuidanceEntry[];
} {
  resetGuidanceState();
  let snap = createEmptySnapshot();
  const allGuidance: GuidanceEntry[] = [];
  for (const s of statements) {
    snap = extractFromStatement(s, snap);
    const guidance = analyzeNewStatement(s, snap);
    allGuidance.push(...guidance);
  }
  return { snapshot: snap, allGuidance };
}

// ─── Scenario 1: "Patient denies allergies" ───

describe('Scenario 1: denies allergies', () => {
  it('allergies field is populated', () => {
    const snap = buildSnapshot(['Patient denies allergies']);
    expect(snap.allergies).toBeTruthy();
  });

  it('allergies not in missingItems', () => {
    const snap = buildSnapshot(['Patient denies allergies']);
    expect(snap.missingItems).not.toContain('Allergies');
  });

  it('guidance does not flag allergies as missing after documented', () => {
    const { allGuidance } = simulateCall([
      '62 year old male complaining of chest pain',
      'BP 120/80',
      'Patient denies allergies',
    ]);
    const lastMissing = [...allGuidance]
      .reverse()
      .find(g => g.type === 'missing_info' && g.text.startsWith('Missing:'));
    if (lastMissing) {
      expect(lastMissing.text.toLowerCase()).not.toContain('allergies');
    }
  });
});

// ─── Scenario 2: "ETA 10 minutes" ───

describe('Scenario 2: ETA 10 minutes', () => {
  it('eta field is populated', () => {
    const snap = buildSnapshot(['ETA 10 minutes']);
    expect(snap.eta).toBe('10 minutes');
  });

  it('ETA not in missingItems when vitals present', () => {
    const snap = buildSnapshot(['BP 120/80', 'ETA 10 minutes']);
    expect(snap.missingItems).not.toContain('ETA');
  });

  it('guidance does not flag ETA as missing after stated', () => {
    const { allGuidance } = simulateCall([
      '62 year old male complaining of chest pain',
      'BP 120/80',
      'ETA 10 minutes',
    ]);
    const lastMissing = [...allGuidance]
      .reverse()
      .find(g => g.type === 'missing_info' && g.text.startsWith('Missing:'));
    if (lastMissing) {
      expect(lastMissing.text).not.toMatch(/\bETA\b/);
    }
  });
});

// ─── Scenario 3: natural speech vitals ───

describe('Scenario 3: BP 160 over 92, pulse 104, respirations 22', () => {
  const phrase = 'BP 160 over 92, pulse 104, respirations 22';

  it('vitals not missing', () => {
    const snap = buildSnapshot([phrase]);
    expect(snap.missingItems).not.toContain('Vitals');
  });

  it('vitalsLatest contains all values', () => {
    const snap = buildSnapshot([phrase]);
    expect(snap.vitalsLatest).toContain('BP 160/92');
    expect(snap.vitalsLatest).toContain('HR 104');
    expect(snap.vitalsLatest).toContain('RR 22');
  });

  it('radio report includes vitals', () => {
    resetGuidanceState();
    const snap = buildSnapshot(['62 year old male complaining of chest pain', phrase]);
    const report = generateRadioReport(snap);
    expect(report).toContain('BP 160/92');
    expect(report).toContain('HR 104');
    expect(report).not.toMatch(/Vitals:.*\[not documented\]/);
  });

  it('PCR includes vitals', () => {
    resetGuidanceState();
    const snap = buildSnapshot(['62 year old male complaining of chest pain', phrase]);
    const pcr = generatePCR(snap, phrase);
    expect(pcr).toContain('BP 160/92');
    expect(pcr).toContain('HR 104');
  });
});

// ─── Scenario 4: "Blood pressure is 160/92" ───

describe('Scenario 4: blood pressure is 160/92', () => {
  const phrase = 'Blood pressure is 160/92';

  it('vitals extracted', () => {
    const snap = buildSnapshot([phrase]);
    expect(snap.vitalsLatest).toContain('BP 160/92');
  });

  it('radio report includes vitals', () => {
    resetGuidanceState();
    const snap = buildSnapshot(['62 year old male complaining of chest pain', phrase]);
    const report = generateRadioReport(snap);
    expect(report).toContain('BP 160/92');
  });

  it('PCR includes vitals', () => {
    resetGuidanceState();
    const snap = buildSnapshot(['62 year old male complaining of chest pain', phrase]);
    const pcr = generatePCR(snap, phrase);
    expect(pcr).toContain('BP 160/92');
  });
});

// ─── Scenario 5: duplicate missing item messages ───

describe('Scenario 5: no duplicate missing items', () => {
  it('missingItems has no duplicates', () => {
    const snap = buildSnapshot([
      '62 year old male complaining of chest pain',
      'BP 120/80',
    ]);
    const unique = [...new Set(snap.missingItems)];
    expect(snap.missingItems).toEqual(unique);
  });

  it('guidance emits at most one Missing: message per statement', () => {
    const { allGuidance } = simulateCall([
      '62 year old male complaining of chest pain',
      'BP 120/80',
    ]);
    const perStatement = allGuidance.filter(
      g => g.type === 'missing_info' && g.text.startsWith('Missing:')
    );
    // Each call to analyzeNewStatement can produce at most 1 Missing: message,
    // and we made 2 calls, so at most 2.
    expect(perStatement.length).toBeLessThanOrEqual(2);
  });

  it('later Missing: message does not repeat items from earlier', () => {
    const { allGuidance } = simulateCall([
      '62 year old male complaining of chest pain',
      'BP 120/80',
      'no allergies',
    ]);
    const missingMsgs = allGuidance
      .filter(g => g.type === 'missing_info' && g.text.startsWith('Missing:'));
    if (missingMsgs.length >= 2) {
      const last = missingMsgs[missingMsgs.length - 1];
      expect(last.text.toLowerCase()).not.toContain('allergies');
    }
  });

  it('latest Missing: message contains only currently-missing items', () => {
    const { snapshot, allGuidance } = simulateCall([
      '62 year old male complaining of chest pain',
      'alert and oriented',
      'BP 158/92 heart rate 96',
      'Allergic to penicillin',
      'Takes metoprolol',
      'history of hypertension',
    ]);
    const lastMissing = [...allGuidance]
      .reverse()
      .find(g => g.type === 'missing_info' && g.text.startsWith('Missing:'));

    if (snapshot.missingItems.length === 0) {
      expect(lastMissing).toBeUndefined();
    } else if (lastMissing) {
      const items = lastMissing.text
        .replace(/^Missing:\s*/, '').replace(/\.$/, '')
        .split(/,\s*/)
        .map(s => s.toLowerCase());
      const currentMissing = new Set(snapshot.missingItems.map(s => s.toLowerCase()));
      for (const item of items) {
        expect(currentMissing.has(item)).toBe(true);
      }
    }
  });
});

// ─── Demo encounter end-to-end ───

describe('Demo encounter (Chest Pain scenario)', () => {
  const scenario = TEST_SCENARIOS.find(s => s.id === 'chest-pain')!;

  it('scenario exists', () => {
    expect(scenario).toBeDefined();
    expect(scenario.statements.length).toBeGreaterThan(0);
  });

  it('extraction completes without error', () => {
    expect(() => buildSnapshot(scenario.statements)).not.toThrow();
  });

  it('key fields are populated', () => {
    const snap = buildSnapshot(scenario.statements);
    expect(snap.patientAge).toBeTruthy();
    expect(snap.patientSex).toBeTruthy();
    expect(snap.chiefComplaint).toBeTruthy();
    expect(snap.vitalsLatest).toBeTruthy();
    expect(snap.allergies).toBeTruthy();
    expect(snap.medications).toBeTruthy();
    expect(snap.pastMedicalHistory).toBeTruthy();
    expect(snap.treatmentsGiven).toBeTruthy();
    expect(snap.eta).toBeTruthy();
    expect(snap.destination).toBeTruthy();
  });

  it('missingItems is empty or near-empty', () => {
    const snap = buildSnapshot(scenario.statements);
    expect(snap.missingItems.length).toBeLessThanOrEqual(1);
  });

  it('radio report generates without error and contains vitals', () => {
    resetGuidanceState();
    const snap = buildSnapshot(scenario.statements);
    const report = generateRadioReport(snap);
    expect(report).toContain('RADIO REPORT');
    expect(report).toContain('BP');
    expect(report).not.toMatch(/Vitals:.*\[not documented\]/);
  });

  it('PCR generates without error and contains vitals trend', () => {
    resetGuidanceState();
    const snap = buildSnapshot(scenario.statements);
    const pcr = generatePCR(snap, scenario.statements.join('\n'));
    expect(pcr).toContain('PRE-HOSPITAL CARE REPORT');
    expect(pcr).toContain('BP');
    expect(pcr).toContain('VITALS TREND');
  });

  it('debrief generates without error', () => {
    resetGuidanceState();
    const snap = buildSnapshot(scenario.statements);
    const debrief = generateDebrief(snap);
    expect(debrief).toContain('CALL DEBRIEF');
    expect(debrief).toContain('✓ Vitals');
  });

  it('guidance does not produce runtime errors', () => {
    expect(() => simulateCall(scenario.statements)).not.toThrow();
  });
});

// ─── Manual/self-entered encounter ───

describe('Manual encounter (typed statements)', () => {
  const statements = [
    '45 year old female complaining of abdominal pain',
    'alert and oriented',
    'blood pressure is 130 over 82, pulse 88, respirations 18, SpO2 98 percent',
    'no allergies',
    'no medications',
    'no medical history',
    'pain is in the right lower quadrant, sharp, 7 out of 10',
    'tenderness on palpation',
    'gave ondansetron 4 milligrams',
    'pain unchanged after ondansetron',
    'transporting to General Hospital, ETA 8 minutes',
  ];

  it('extraction completes without error', () => {
    expect(() => buildSnapshot(statements)).not.toThrow();
  });

  it('all SAMPLE fields documented', () => {
    const snap = buildSnapshot(statements);
    expect(snap.allergies).toBeTruthy();
    expect(snap.medications).toBeTruthy();
    expect(snap.pastMedicalHistory).toBeTruthy();
    expect(snap.vitalsLatest).toBeTruthy();
  });

  it('missingItems is empty', () => {
    const snap = buildSnapshot(statements);
    expect(snap.missingItems).toEqual([]);
  });

  it('reports generate without error', () => {
    resetGuidanceState();
    const snap = buildSnapshot(statements);
    expect(() => generateRadioReport(snap)).not.toThrow();
    expect(() => generatePCR(snap, statements.join('\n'))).not.toThrow();
    expect(() => generateDebrief(snap)).not.toThrow();
  });

  it('radio report has no false "[not documented]" for filled fields', () => {
    resetGuidanceState();
    const snap = buildSnapshot(statements);
    const report = generateRadioReport(snap);
    expect(report).not.toMatch(/Vitals:.*\[not documented\]/);
    expect(report).not.toMatch(/Treatment:.*\[not documented\]/);
    expect(report).not.toMatch(/ETA:.*\[not documented\]/);
  });

  it('PCR shows allergies as documented (not "[not documented]")', () => {
    resetGuidanceState();
    const snap = buildSnapshot(statements);
    const pcr = generatePCR(snap, statements.join('\n'));
    expect(pcr).not.toMatch(/Allergies:.*\[not documented\]/);
  });

  it('debrief shows all items captured', () => {
    resetGuidanceState();
    const snap = buildSnapshot(statements);
    const debrief = generateDebrief(snap);
    expect(debrief).toContain('None — all key fields captured');
  });
});

// ─── All demo scenarios ───

describe('All demo scenarios generate reports without error', () => {
  for (const scenario of TEST_SCENARIOS) {
    describe(scenario.name, () => {
      it('extraction completes', () => {
        expect(() => buildSnapshot(scenario.statements)).not.toThrow();
      });

      it('guidance completes', () => {
        expect(() => simulateCall(scenario.statements)).not.toThrow();
      });

      it('reports generate', () => {
        resetGuidanceState();
        const snap = buildSnapshot(scenario.statements);
        const transcript = scenario.statements.join('\n');
        expect(() => generateRadioReport(snap)).not.toThrow();
        expect(() => generatePCR(snap, transcript)).not.toThrow();
        expect(() => generateDebrief(snap)).not.toThrow();
      });

      it('radio report contains vitals when extracted', () => {
        resetGuidanceState();
        const snap = buildSnapshot(scenario.statements);
        if (snap.vitalsLatest) {
          const report = generateRadioReport(snap);
          expect(report).not.toMatch(/Vitals:.*\[not documented\]/);
        }
      });

      it('transcriptToClinicalFacts matches extractFromStatement', () => {
        const fromExtract = buildSnapshot(scenario.statements);
        const fromTranscript = transcriptToClinicalFacts(scenario.statements);
        expect(fromTranscript.vitalsLatest).toBe(fromExtract.vitalsLatest);
        expect(fromTranscript.allergies).toBe(fromExtract.allergies);
        expect(fromTranscript.medications).toBe(fromExtract.medications);
        expect(fromTranscript.eta).toBe(fromExtract.eta);
        expect(fromTranscript.missingItems).toEqual(fromExtract.missingItems);
      });
    });
  }
});

// ─── Stale Protocol Support messages ───

describe('Stale guidance removal', () => {
  it('Missing: message updates as items are resolved across statements', () => {
    resetGuidanceState();
    let snap = createEmptySnapshot();
    let lastGuidance: GuidanceEntry[] = [];

    const steps = [
      '62 year old male complaining of chest pain',
      'BP 158/92 heart rate 96',
      'no known allergies',
      'takes lisinopril',
      'history of hypertension',
      'ETA 10 minutes',
    ];

    for (const s of steps) {
      snap = extractFromStatement(s, snap);
      lastGuidance = analyzeNewStatement(s, snap);
    }

    if (snap.missingItems.length === 0) {
      const hasMissing = lastGuidance.some(
        g => g.type === 'missing_info' && g.text.startsWith('Missing:')
      );
      expect(hasMissing).toBe(false);
    } else {
      const missingMsg = lastGuidance.find(
        g => g.type === 'missing_info' && g.text.startsWith('Missing:')
      );
      expect(missingMsg).toBeDefined();
      const items = missingMsg!.text
        .replace(/^Missing:\s*/, '').replace(/\.$/, '')
        .split(/,\s*/)
        .map(s => s.toLowerCase());
      const currentMissing = new Set(snap.missingItems.map(s => s.toLowerCase()));
      for (const item of items) {
        expect(currentMissing.has(item)).toBe(true);
      }
    }
  });

  it('resolved items do not persist in the latest Missing: message', () => {
    resetGuidanceState();
    let snap = createEmptySnapshot();
    let lastMissing: GuidanceEntry | undefined;

    snap = extractFromStatement('62 year old male complaining of chest pain', snap);
    analyzeNewStatement('62 year old male complaining of chest pain', snap);

    snap = extractFromStatement('BP 120/80', snap);
    let guidance = analyzeNewStatement('BP 120/80', snap);
    lastMissing = guidance.filter(g => g.type === 'missing_info' && g.text.startsWith('Missing:')).pop();
    if (lastMissing) {
      expect(lastMissing.text.toLowerCase()).toContain('allergies');
    }

    snap = extractFromStatement('no known allergies', snap);
    guidance = analyzeNewStatement('no known allergies', snap);
    lastMissing = guidance.filter(g => g.type === 'missing_info' && g.text.startsWith('Missing:')).pop();
    if (lastMissing) {
      expect(lastMissing.text.toLowerCase()).not.toContain('allergies');
    }
  });
});
