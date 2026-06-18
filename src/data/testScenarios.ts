export interface TestScenario {
  id: string;
  name: string;
  category: string;
  statements: string[];
}

export const TEST_SCENARIOS: TestScenario[] = [
  {
    id: 'chest-pain',
    name: 'Chest Pain — ACS',
    category: 'Cardiac',
    statements: [
      "Dispatch, we're on scene. 62-year-old male complaining of chest pain.",
      "Patient states pain started about 30 minutes ago. Describes it as pressure, substernal, radiating to left arm.",
      "Pain severity seven out of ten. Patient is diaphoretic, appears anxious.",
      "Blood pressure 158 over 92, heart rate 96, respiratory rate 20, SpO2 95 percent on room air.",
      "Patient has history of hypertension and diabetes. Takes lisinopril and metoprolol.",
      "Allergic to penicillin. No known cardiac history.",
      "We gave aspirin 324, started oxygen at 4 liters nasal cannula, and obtained a 12-lead.",
      "12-lead shows sinus tach, no acute ST changes.",
      "Patient reports pain decreased to four out of ten after aspirin.",
      "ETA to St. Mary's Medical Center approximately 12 minutes. Continuing to monitor.",
    ],
  },
  {
    id: 'shortness-of-breath',
    name: 'Shortness of Breath — COPD',
    category: 'Respiratory',
    statements: [
      "On scene with a 71-year-old female complaining of difficulty breathing.",
      "Onset was gradual over the past two hours. Worsening despite home nebulizer.",
      "Patient is sitting upright, tripod positioning, speaking in two to three word sentences.",
      "Lung sounds reveal bilateral wheezing, diminished at bases.",
      "Blood pressure 142 over 88, heart rate 110, respiratory rate 28, SpO2 89 percent.",
      "History of COPD, CHF, and hypertension. Takes albuterol inhaler, furosemide, and lisinopril.",
      "No known allergies.",
      "Administered albuterol nebulizer treatment and started oxygen at 6 liters.",
      "SpO2 improving to 93 percent after nebulizer. Respiratory rate down to 22.",
      "Transporting to Regional Medical Center, ETA 8 minutes.",
    ],
  },
  {
    id: 'altered-mental-status',
    name: 'Altered Mental Status',
    category: 'Neurological',
    statements: [
      "We have a 58-year-old male found unresponsive by family.",
      "Patient is lethargic, responds to verbal stimuli. GCS 10, eyes 3, verbal 3, motor 4.",
      "Pupils are equal and reactive. No facial droop or arm drift noted.",
      "Blood glucose is 38.",
      "Blood pressure 130 over 78, heart rate 88, respiratory rate 16, SpO2 97 percent.",
      "History of diabetes, takes insulin and metformin. Wife states he skipped dinner last night.",
      "No known allergies.",
      "Establishing IV access. Administering dextrose D10 per protocol.",
      "Patient becoming more alert. GCS now 14. Blood glucose rechecked at 110.",
      "Patient is alert and oriented, refusing transport. Advised to eat and follow up with physician.",
    ],
  },
  {
    id: 'stroke',
    name: 'Stroke Symptoms — CVA',
    category: 'Neurological',
    statements: [
      "Responding for a 73-year-old female with sudden onset right-sided weakness.",
      "Family states symptoms started approximately 45 minutes ago. Patient was watching TV when right arm went limp.",
      "Patient has facial droop on the right side, right arm drift, and slurred speech.",
      "Cincinnati Stroke Scale is positive, three out of three findings.",
      "Blood pressure 188 over 102, heart rate 78, respiratory rate 14, SpO2 98 percent.",
      "Blood glucose 142. Pupils equal and reactive.",
      "History of atrial fibrillation and hypertension. Takes eliquis and amlodipine.",
      "No known allergies.",
      "Activating stroke alert. Last known normal was 45 minutes ago per family.",
      "Transporting to University Stroke Center. ETA 15 minutes. No changes in neuro status en route.",
    ],
  },
  {
    id: 'trauma-fall',
    name: 'Trauma — Fall',
    category: 'Trauma',
    statements: [
      "On scene for a 78-year-old female who fell down approximately six stairs.",
      "Patient is alert and oriented, complaining of left hip pain and a laceration to forehead.",
      "Mechanism is a fall from approximately 8 feet total height down a staircase.",
      "GCS 15. Pupils equal and reactive. No loss of consciousness per patient.",
      "Blood pressure 110 over 72, heart rate 102, respiratory rate 18, SpO2 96 percent.",
      "Left hip shows deformity and tenderness. Forehead lac is about 3 centimeters, controlled with direct pressure.",
      "History of osteoporosis and atrial fibrillation. Takes warfarin and calcium.",
      "Allergic to sulfa drugs.",
      "Applied pelvic binder as precaution, splinted left leg, bandaged forehead. Started IV normal saline.",
      "Transporting to Community Trauma Center. ETA 10 minutes. Patient reports pain at six out of ten.",
    ],
  },
  {
    id: 'allergic-reaction',
    name: 'Allergic Reaction — Anaphylaxis',
    category: 'Allergy',
    statements: [
      "Responding for a 34-year-old male with allergic reaction after eating at a restaurant.",
      "Patient reports throat tightness, difficulty swallowing, and generalized hives.",
      "Onset was approximately 15 minutes ago after eating shrimp. Patient has known shellfish allergy.",
      "Tongue appears swollen. Voice is hoarse. Bilateral wheezing on auscultation.",
      "Blood pressure 92 over 58, heart rate 118, respiratory rate 24, SpO2 94 percent.",
      "Patient used his own epipen prior to our arrival.",
      "No other medications. No other allergies.",
      "Administering epinephrine 0.3 milligrams IM per protocol. Starting IV normal saline bolus.",
      "Blood pressure improving to 108 over 68. Wheezing decreased. Hives still present.",
      "Transporting to General Hospital. ETA 7 minutes. Monitoring for biphasic reaction.",
    ],
  },
  {
    id: 'hypoglycemia',
    name: 'Hypoglycemia',
    category: 'Endocrine',
    statements: [
      "On scene with a 45-year-old female found confused and diaphoretic by coworkers.",
      "Patient is conscious but disoriented. Unable to state her name or location.",
      "Blood glucose reads 42.",
      "Blood pressure 128 over 80, heart rate 100, respiratory rate 18, SpO2 98 percent.",
      "History of type 1 diabetes. Takes insulin. Coworkers say she skipped lunch.",
      "Allergic to latex.",
      "Patient is unable to swallow safely. Establishing IV access.",
      "Administering dextrose D10 250 milliliters IV per protocol.",
      "Patient now alert and oriented. Blood glucose rechecked at 128. GCS 15.",
      "Patient agreeing to transport for evaluation. Transporting to Mercy Hospital, ETA 10 minutes.",
    ],
  },
  {
    id: 'seizure',
    name: 'Seizure — Status Epilepticus',
    category: 'Neurological',
    statements: [
      "Responding for a 29-year-old male actively seizing. Bystanders report seizure started 5 minutes ago.",
      "Patient is having generalized tonic-clonic seizure activity. Not responsive.",
      "Protecting airway, suctioning secretions. Placed on left side.",
      "Blood pressure 160 over 94, heart rate 130, respiratory rate 8, SpO2 88 percent.",
      "Blood glucose is 96. Pupils are dilated but reactive.",
      "Bystander found a pill bottle, levetiracetam. Possible seizure disorder. No other history available.",
      "No known allergies per pill bottle label.",
      "Seizure activity continuing at 8 minutes. Administering midazolam 5 milligrams IM per protocol.",
      "Seizure activity stopped at 10 minutes. Patient is postictal, GCS 8. Applying oxygen, monitoring airway.",
      "Transporting to University Hospital. ETA 12 minutes. GCS improving to 10 en route.",
    ],
  },
];

export function getScenarioById(id: string): TestScenario | undefined {
  return TEST_SCENARIOS.find((s) => s.id === id);
}
