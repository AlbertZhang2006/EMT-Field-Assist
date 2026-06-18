import { describe, it, expect } from 'vitest';
import { transcriptToClinicalFacts, normalizeMissingItems } from './extractionService';

function facts(messages: string[]) {
  return transcriptToClinicalFacts(messages);
}

describe('extractAllergies', () => {
  it.each([
    ['no allergies'],
    ['no known allergies'],
    ['denies allergies'],
    ['denies any allergies'],
  ])('"%s" → documented, not missing', (phrase) => {
    const result = facts([phrase]);
    expect(result.allergies).toBeTruthy();
    expect(result.missingItems).not.toContain('Allergies');
  });

  it.each([
    ['NKA'],
    ['NKDA'],
    ['nkda'],
  ])('"%s" → NKDA, not missing', (phrase) => {
    const result = facts([phrase]);
    expect(result.allergies).toBe('NKDA');
    expect(result.missingItems).not.toContain('Allergies');
  });

  it('extracts specific allergy', () => {
    const result = facts(['allergic to penicillin']);
    expect(result.allergies).toBe('penicillin');
    expect(result.missingItems).not.toContain('Allergies');
  });

  it('missing when no allergy info given', () => {
    const result = facts(['72 year old male with chest pain']);
    expect(result.allergies).toBeNull();
    expect(result.missingItems).toContain('Allergies');
  });
});

describe('extractMedications', () => {
  it.each([
    ['no meds'],
    ['no medications'],
    ['denies medications'],
    ['denies any medication'],
  ])('"%s" → documented, not missing', (phrase) => {
    const result = facts([phrase]);
    expect(result.medications).toBeTruthy();
    expect(result.missingItems).not.toContain('Medications');
  });

  it('extracts "takes metoprolol"', () => {
    const result = facts(['takes metoprolol']);
    expect(result.medications).toContain('metoprolol');
    expect(result.missingItems).not.toContain('Medications');
  });

  it('extracts "on blood thinners"', () => {
    const result = facts(['on blood thinners']);
    expect(result.medications).toContain('blood thinners');
    expect(result.missingItems).not.toContain('Medications');
  });

  it('missing when no medication info given', () => {
    const result = facts(['72 year old male with chest pain']);
    expect(result.medications).toBeNull();
    expect(result.missingItems).toContain('Medications');
  });
});

describe('extractPMH', () => {
  it('extracts "history of diabetes"', () => {
    const result = facts(['history of diabetes']);
    expect(result.pastMedicalHistory).toContain('diabetes');
    expect(result.missingItems).not.toContain('Past medical history');
  });

  it('extracts "past history of MI"', () => {
    const result = facts(['past history of MI']);
    expect(result.pastMedicalHistory).toBeTruthy();
    expect(result.missingItems).not.toContain('Past medical history');
  });

  it('extracts "cardiac history"', () => {
    const result = facts(['cardiac history']);
    expect(result.pastMedicalHistory).toContain('cardiac history');
    expect(result.missingItems).not.toContain('Past medical history');
  });

  it.each([
    ['no medical history'],
    ['denies medical history'],
    ['denies any history'],
    ['no past medical history'],
  ])('"%s" → documented, not missing', (phrase) => {
    const result = facts([phrase]);
    expect(result.pastMedicalHistory).toBeTruthy();
    expect(result.missingItems).not.toContain('Past medical history');
  });

  it('missing when no PMH info given', () => {
    const result = facts(['72 year old male with chest pain']);
    expect(result.pastMedicalHistory).toBeNull();
    expect(result.missingItems).toContain('Past medical history');
  });
});

describe('extractETA', () => {
  it.each([
    ['ETA 10 minutes', '10 minutes'],
    ['ETA is 10', '10 min'],
    ['ETA is 10 minutes', '10 minutes'],
    ['ETA: 15 minutes', '15 minutes'],
    ['ETA of 8 minutes', '8 minutes'],
    ['estimated 12 minutes', '12 minutes'],
  ])('"%s" → %s', (phrase, expected) => {
    const result = facts([phrase]);
    expect(result.eta).toBe(expected);
    expect(result.missingItems).not.toContain('ETA');
  });

  it.each([
    ['about 10 minutes out', '10 min'],
    ['we are 5 minutes out', '5 min'],
    ['roughly 7 minutes out', '7 min'],
  ])('"%s" → %s (minutes out)', (phrase, expected) => {
    const result = facts([phrase]);
    expect(result.eta).toBe(expected);
    expect(result.missingItems).not.toContain('ETA');
  });

  it.each([
    ['arriving in 5 minutes', '5 min'],
    ['arriving in about 8 minutes', '8 min'],
    ["we're about 12 minutes out", '12 min'],
    ['we are 5 minutes away', '5 min'],
  ])('"%s" → %s (arriving/we are)', (phrase, expected) => {
    const result = facts([phrase]);
    expect(result.eta).toBe(expected);
    expect(result.missingItems).not.toContain('ETA');
  });

  it.each([
    ['destination in 12 minutes', '12 min'],
    ['destination in about 15 minutes', '15 min'],
  ])('"%s" → %s (destination in)', (phrase, expected) => {
    const result = facts([phrase]);
    expect(result.eta).toBe(expected);
    expect(result.missingItems).not.toContain('ETA');
  });

  it('ETA not in missingItems when vitals present and ETA extracted', () => {
    const result = facts([
      'BP 120/80 pulse 72',
      'ETA 10 minutes',
    ]);
    expect(result.eta).toBe('10 minutes');
    expect(result.missingItems).not.toContain('ETA');
  });

  it('ETA in missingItems when vitals present but no ETA', () => {
    const result = facts([
      'BP 120/80 pulse 72',
    ]);
    expect(result.eta).toBeNull();
    expect(result.missingItems).toContain('ETA');
  });

  it('approximately pattern still works', () => {
    const result = facts(['approximately 10 minutes']);
    expect(result.eta).toBe('10 min');
  });
});

describe('extractVitals', () => {
  describe('blood pressure', () => {
    it.each([
      ['BP 160/92', 'BP 160/92'],
      ['BP 160 over 92', 'BP 160/92'],
      ['blood pressure 160 over 92', 'BP 160/92'],
      ['blood pressure is 160/92', 'BP 160/92'],
      ['BP is 120/80', 'BP 120/80'],
    ])('"%s" → %s', (phrase, expected) => {
      const result = facts([phrase]);
      expect(result.vitalsLatest).toContain(expected);
      expect(result.missingItems).not.toContain('Vitals');
    });
  });

  describe('heart rate', () => {
    it.each([
      ['pulse 104', 'HR 104'],
      ['heart rate 104', 'HR 104'],
      ['HR 104', 'HR 104'],
      ['heart rate is 88', 'HR 88'],
    ])('"%s" → %s', (phrase, expected) => {
      const result = facts([phrase]);
      expect(result.vitalsLatest).toContain(expected);
    });
  });

  describe('respiratory rate', () => {
    it.each([
      ['respirations 22', 'RR 22'],
      ['respiratory rate 22', 'RR 22'],
      ['RR 22', 'RR 22'],
      ['respiratory rate is 18', 'RR 18'],
    ])('"%s" → %s', (phrase, expected) => {
      const result = facts([phrase]);
      expect(result.vitalsLatest).toContain(expected);
    });
  });

  describe('SpO2', () => {
    it.each([
      ['SpO2 94', 'SpO2 94%'],
      ['SpO2 94 percent', 'SpO2 94%'],
      ['O2 sat 94', 'SpO2 94%'],
      ['oxygen saturation 94 percent', 'SpO2 94%'],
      ['sats 97', 'SpO2 97%'],
    ])('"%s" → %s', (phrase, expected) => {
      const result = facts([phrase]);
      expect(result.vitalsLatest).toContain(expected);
    });
  });

  describe('GCS', () => {
    it.each([
      ['GCS 15', 'GCS 15'],
      ['GCS is 12', 'GCS 12'],
      ['GCS of 10', 'GCS 10'],
    ])('"%s" → %s', (phrase, expected) => {
      const result = facts([phrase]);
      expect(result.vitalsLatest).toContain(expected);
    });
  });

  describe('temperature', () => {
    it.each([
      ['temperature 98.6', 'Temp 98.6'],
      ['temp 98.6', 'Temp 98.6'],
      ['temp is 101.2', 'Temp 101.2'],
    ])('"%s" → %s', (phrase, expected) => {
      const result = facts([phrase]);
      expect(result.vitalsLatest).toContain(expected);
    });
  });

  describe('blood glucose', () => {
    it.each([
      ['blood sugar 85', 'BGL 85'],
      ['glucose 85', 'BGL 85'],
      ['BGL 85', 'BGL 85'],
      ['blood glucose is 42', 'BGL 42'],
    ])('"%s" → %s', (phrase, expected) => {
      const result = facts([phrase]);
      expect(result.vitalsLatest).toContain(expected);
    });
  });

  describe('vitals trend tracking', () => {
    it('second set of vitals updates vitalsLatest and appends to vitalsTrend', () => {
      const result = facts([
        'BP 160/92 pulse 104',
        'BP improving to 140/88 pulse 92',
      ]);
      expect(result.vitalsLatest).toContain('BP 140/88');
      expect(result.vitalsLatest).toContain('HR 92');
      expect(result.vitalsTrend).toHaveLength(2);
      expect(result.vitalsTrend[0]).toContain('BP 160/92');
      expect(result.vitalsTrend[1]).toContain('BP 140/88');
    });

    it('partial update only overwrites changed vitals in vitalsLatest', () => {
      const result = facts([
        'BP 160/92 pulse 104 SpO2 94 percent',
        'SpO2 improving to 98 percent',
      ]);
      expect(result.vitalsLatest).toContain('BP 160/92');
      expect(result.vitalsLatest).toContain('HR 104');
      expect(result.vitalsLatest).toContain('SpO2 98%');
    });
  });

  describe('natural speech patterns', () => {
    it('full vitals in one sentence', () => {
      const result = facts([
        'Blood pressure 158 over 92, heart rate 96, respiratory rate 20, SpO2 95 percent on room air.',
      ]);
      expect(result.vitalsLatest).toContain('BP 158/92');
      expect(result.vitalsLatest).toContain('HR 96');
      expect(result.vitalsLatest).toContain('RR 20');
      expect(result.vitalsLatest).toContain('SpO2 95%');
      expect(result.missingItems).not.toContain('Vitals');
    });

    it('vitals with "is" connector', () => {
      const result = facts([
        'Blood pressure is 130 over 78, heart rate is 88.',
      ]);
      expect(result.vitalsLatest).toContain('BP 130/78');
      expect(result.vitalsLatest).toContain('HR 88');
    });

    it('blood glucose reads pattern', () => {
      const result = facts(['Blood glucose reads 38.']);
      expect(result.vitalsLatest).toContain('BGL 38');
    });
  });

  it('any vital detected removes Vitals from missingItems', () => {
    const result = facts(['pulse 88']);
    expect(result.missingItems).not.toContain('Vitals');
  });

  it('no vitals keeps Vitals in missingItems', () => {
    const result = facts(['72 year old male']);
    expect(result.vitalsLatest).toBeNull();
    expect(result.missingItems).toContain('Vitals');
  });
});

describe('normalizeMissingItems', () => {
  it('maps PMH to canonical label', () => {
    expect(normalizeMissingItems(['PMH'])).toEqual(['Past medical history']);
  });

  it('maps meds to canonical label', () => {
    expect(normalizeMissingItems(['meds'])).toEqual(['Medications']);
  });

  it('maps cc to canonical label', () => {
    expect(normalizeMissingItems(['cc'])).toEqual(['Chief complaint']);
  });

  it('deduplicates items with different casing', () => {
    expect(normalizeMissingItems(['ETA', 'eta'])).toEqual(['ETA']);
  });

  it('deduplicates synonyms', () => {
    expect(normalizeMissingItems(['PMH', 'Past medical history'])).toEqual(['Past medical history']);
  });

  it('preserves order of first occurrence', () => {
    const result = normalizeMissingItems(['Vitals', 'PMH', 'ETA']);
    expect(result).toEqual(['Vitals', 'Past medical history', 'ETA']);
  });

  it('passes through unknown labels unchanged', () => {
    expect(normalizeMissingItems(['Custom field'])).toEqual(['Custom field']);
  });
});

describe('missingItems integration', () => {
  it('all SAMPLE negatives remove items from missing', () => {
    const result = facts([
      '72 year old male complaining of chest pain',
      'alert and oriented',
      'BP 130/80 pulse 88',
      'no allergies',
      'no medications',
      'no medical history',
      'ETA 10 minutes',
    ]);
    expect(result.missingItems).toEqual([]);
  });

  it('incomplete transcript shows correct missing items', () => {
    const result = facts([
      'complaining of chest pain',
    ]);
    expect(result.missingItems).toContain('Age');
    expect(result.missingItems).toContain('Sex');
    expect(result.missingItems).toContain('Vitals');
    expect(result.missingItems).toContain('Allergies');
    expect(result.missingItems).toContain('Medications');
    expect(result.missingItems).toContain('Past medical history');
  });

  it('uses consistent canonical labels', () => {
    const result = facts(['complaining of chest pain']);
    for (const item of result.missingItems) {
      expect(item).not.toBe('PMH');
      expect(item).not.toBe('meds');
      expect(item).not.toBe('cc');
    }
  });

  it('"No known allergies" is not missing', () => {
    const result = facts(['no known allergies']);
    expect(result.allergies).toBe('No known allergies');
    expect(result.missingItems).not.toContain('Allergies');
  });

  it('"None" medications is not missing', () => {
    const result = facts(['no medications']);
    expect(result.medications).toBe('None');
    expect(result.missingItems).not.toContain('Medications');
  });

  it('"None" PMH is not missing', () => {
    const result = facts(['no medical history']);
    expect(result.pastMedicalHistory).toBe('None');
    expect(result.missingItems).not.toContain('Past medical history');
  });

  it('ETA present removes ETA from missing', () => {
    const result = facts([
      'BP 120/80',
      'ETA 10 minutes',
    ]);
    expect(result.missingItems).not.toContain('ETA');
  });

  it('vitalsLatest present removes Vitals from missing', () => {
    const result = facts(['pulse 88']);
    expect(result.vitalsLatest).toBeTruthy();
    expect(result.missingItems).not.toContain('Vitals');
  });

  it('no duplicate entries in missingItems', () => {
    const result = facts(['72 year old male']);
    const unique = [...new Set(result.missingItems)];
    expect(result.missingItems).toEqual(unique);
  });

  it('resolved items do not reappear', () => {
    const result = facts([
      'complaining of chest pain',
      'BP 120/80 pulse 88',
      'no allergies',
      'no medications',
      'no medical history',
    ]);
    expect(result.missingItems).not.toContain('Allergies');
    expect(result.missingItems).not.toContain('Medications');
    expect(result.missingItems).not.toContain('Past medical history');
    expect(result.missingItems).not.toContain('Vitals');
  });
});
