// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  analyzeNewStatement,
  resetGuidanceState,
  generateRadioReport,
  generatePCR,
  generateDebrief,
} from './guidanceEngine';
import { createEmptySnapshot, extractFromStatement } from './extractionService';
import type { CallSnapshot } from '../types/index';

function buildSnapshot(statements: string[]): CallSnapshot {
  let snap = createEmptySnapshot();
  for (const s of statements) {
    snap = extractFromStatement(s, snap);
  }
  return snap;
}

function missingInfoMessages(entries: { type: string; text: string }[]): string[] {
  return entries
    .filter(e => e.type === 'missing_info')
    .map(e => e.text);
}

function allMissingMentions(entries: { type: string; text: string }[]): string[] {
  return entries
    .filter(e => e.text.startsWith('Missing:'))
    .map(e => e.text);
}

describe('guidance engine missing-item dedup', () => {
  beforeEach(() => {
    resetGuidanceState();
  });

  it('emits at most one Missing: message per statement', () => {
    const snap = buildSnapshot([
      '62 year old male complaining of chest pain',
      'BP 158/92 heart rate 96',
    ]);
    const guidance = analyzeNewStatement('BP 158/92 heart rate 96', snap);
    const missing = allMissingMentions(guidance);
    expect(missing.length).toBeLessThanOrEqual(1);
  });

  it('does not repeat items across Missing: and protocol doc messages', () => {
    const snap = buildSnapshot([
      '62 year old male complaining of chest pain',
      'BP 158/92 heart rate 96',
    ]);
    const guidance = analyzeNewStatement('BP 158/92 heart rate 96', snap);
    const allTexts = guidance.map(g => g.text).join(' | ');
    const allergyMatches = allTexts.match(/\ballergies\b/gi) ?? [];
    expect(allergyMatches.length).toBeLessThanOrEqual(1);
  });

  it('updates Missing: message when items are resolved', () => {
    const snap1 = buildSnapshot([
      '62 year old male complaining of chest pain',
      'BP 158/92',
    ]);
    const g1 = analyzeNewStatement('BP 158/92', snap1);
    const missing1 = missingInfoMessages(g1);
    expect(missing1.length).toBe(1);
    expect(missing1[0]).toContain('Allergies');

    const snap2 = buildSnapshot([
      '62 year old male complaining of chest pain',
      'BP 158/92',
      'no known allergies',
    ]);
    const g2 = analyzeNewStatement('no known allergies', snap2);
    const missing2 = missingInfoMessages(g2);
    if (missing2.length > 0) {
      expect(missing2[0]).not.toContain('Allergies');
    }
  });

  it('emits no Missing: message when all items documented', () => {
    const snap = buildSnapshot([
      '62 year old male complaining of chest pain',
      'alert and oriented',
      'BP 130/80 pulse 88',
      'no allergies',
      'no medications',
      'no medical history',
      'ETA 10 minutes',
    ]);
    const guidance = analyzeNewStatement('ETA 10 minutes', snap);
    const missing = allMissingMentions(guidance);
    expect(missing).toEqual([]);
  });

  it('uses canonical labels in Missing: message', () => {
    const snap = buildSnapshot([
      '62 year old male complaining of chest pain',
      'BP 130/80',
    ]);
    const guidance = analyzeNewStatement('BP 130/80', snap);
    const missing = missingInfoMessages(guidance);
    if (missing.length > 0) {
      expect(missing[0]).not.toMatch(/\bPMH\b/);
      expect(missing[0]).not.toMatch(/\bmeds\b/i);
    }
  });
});

const DEMO_STATEMENTS = [
  "62-year-old male complaining of chest pain.",
  "Blood pressure 158 over 92, heart rate 96, respiratory rate 20, SpO2 95 percent.",
  "Patient has history of hypertension and diabetes. Takes lisinopril and metoprolol.",
  "Allergic to penicillin.",
  "alert and oriented",
  "We gave aspirin 324, started oxygen at 4 liters nasal cannula.",
  "Patient reports pain decreased to four out of ten after aspirin.",
  "ETA to St. Mary's Medical Center approximately 12 minutes.",
];

function demoSnapshot(): CallSnapshot {
  return buildSnapshot(DEMO_STATEMENTS);
}

describe('generateRadioReport', () => {
  beforeEach(() => resetGuidanceState());

  it('includes vitalsLatest in radio report', () => {
    const snap = demoSnapshot();
    const report = generateRadioReport(snap);
    expect(report).toContain('BP 158/92');
    expect(report).toContain('HR 96');
  });

  it('includes ETA', () => {
    const report = generateRadioReport(demoSnapshot());
    expect(report).toContain('ETA');
    expect(report).toMatch(/12 min/);
  });

  it('includes allergies correctly for specific allergy', () => {
    const report = generateRadioReport(demoSnapshot());
    expect(report).toContain('allergic to penicillin');
  });

  it('includes NKDA naturally', () => {
    const snap = buildSnapshot(['62 year old male', 'BP 120/80', 'NKDA']);
    const report = generateRadioReport(snap);
    expect(report).toContain('NKDA');
    expect(report).not.toContain('allergic to NKDA');
  });

  it('does not say "[not documented]" for fields present in transcript', () => {
    const report = generateRadioReport(demoSnapshot());
    expect(report).not.toMatch(/Vitals:.*\[not documented\]/);
    expect(report).not.toMatch(/Treatment:.*\[not documented\]/);
    expect(report).not.toMatch(/Response:.*\[not documented\]/);
    expect(report).not.toMatch(/ETA:.*\[not documented\]/);
  });
});

describe('generatePCR', () => {
  beforeEach(() => resetGuidanceState());

  it('includes vitalsLatest in PCR assessment', () => {
    const snap = demoSnapshot();
    const pcr = generatePCR(snap, DEMO_STATEMENTS.join('\n'));
    expect(pcr).toContain('BP 158/92');
    expect(pcr).toContain('HR 96');
  });

  it('includes vitalsTrend when multiple sets', () => {
    const snap = buildSnapshot([
      '62 year old male complaining of chest pain',
      'BP 158/92 pulse 96',
      'BP improving to 140/88 pulse 88',
    ]);
    const pcr = generatePCR(snap, '');
    expect(pcr).toContain('Initial:');
    expect(pcr).toContain('Set 2:');
    expect(pcr).toContain('BP 158/92');
    expect(pcr).toContain('BP 140/88');
  });

  it('does not show "[not documented]" for allergies when NKDA', () => {
    const snap = buildSnapshot([
      '62 year old male', 'BP 120/80', 'no known allergies',
    ]);
    const pcr = generatePCR(snap, '');
    expect(pcr).toContain('Allergies: No known allergies');
    expect(pcr).not.toMatch(/Allergies:.*\[not documented\]/);
  });

  it('omits allergies line entirely when not documented', () => {
    const snap = buildSnapshot(['62 year old male', 'BP 120/80']);
    const pcr = generatePCR(snap, '');
    expect(pcr).not.toContain('Allergies:');
  });

  it('does not say "[not documented]" for documented fields', () => {
    const pcr = generatePCR(demoSnapshot(), DEMO_STATEMENTS.join('\n'));
    expect(pcr).not.toMatch(/Vitals:.*\[not documented\]/);
    expect(pcr).not.toMatch(/PMH:.*\[not documented\]/);
  });
});

describe('generateDebrief', () => {
  beforeEach(() => resetGuidanceState());

  it('lists vitals as documented when present', () => {
    const debrief = generateDebrief(demoSnapshot());
    expect(debrief).toContain('✓ Vitals');
  });

  it('uses missingItems for missing section', () => {
    const snap = demoSnapshot();
    const debrief = generateDebrief(snap);
    if (snap.missingItems.length === 0) {
      expect(debrief).toContain('None — all key fields captured');
    } else {
      for (const item of snap.missingItems) {
        expect(debrief).toContain(`✗ ${item}`);
      }
    }
  });

  it('does not list a documented field as missing', () => {
    const snap = buildSnapshot([
      '62 year old male complaining of chest pain',
      'alert and oriented',
      'BP 130/80',
      'no allergies',
      'no medications',
      'no medical history',
      'ETA 10 minutes',
    ]);
    const debrief = generateDebrief(snap);
    expect(debrief).not.toMatch(/✗.*Vitals/);
    expect(debrief).not.toMatch(/✗.*Allergies/);
    expect(debrief).not.toMatch(/✗.*Medications/);
    expect(debrief).not.toMatch(/✗.*Past medical history/);
    expect(debrief).toContain('None — all key fields captured');
  });

  it('improvement suggestions use missingItems', () => {
    const snap = buildSnapshot([
      '62 year old male complaining of chest pain',
      'BP 130/80',
    ]);
    const debrief = generateDebrief(snap);
    expect(debrief).toContain('Capture');
    expect(debrief).not.toMatch(/Capture.*Vitals/);
  });
});
