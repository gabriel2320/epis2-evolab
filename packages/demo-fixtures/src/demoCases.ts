/**
 * Cinco casos clínicos DEMO completos (EPIS2-09).
 * IDs alineados con `database/migrations/004_seed_synthetic.sql` y `006_demo_five_cases.sql`.
 */

export const SYNTHETIC_LABEL = 'DEMO/SINTÉTICO' as const;
export const DEMO_IDENTIFIER_SYSTEM = 'EPIS2-DEMO' as const;

export type DemoClinicalCase = {
  patientId: string;
  demoCaseCode: string;
  displayName: string;
  birthDate: string;
  sex: 'F' | 'M';
  scenario: string;
  encounterId: string;
  summaryFields: Record<string, string>;
};

export const DEMO_CLINICAL_CASES: DemoClinicalCase[] = [
  {
    patientId: 'a0000001-0000-4000-8000-000000000001',
    demoCaseCode: 'DEMO-001',
    displayName: 'Paciente Demo — Carmen Soto',
    birthDate: '1985-03-12',
    sex: 'F',
    scenario: 'IAM en evaluación — HTA de base (demo)',
    encounterId: 'b0000001-0000-4000-8000-000000000001',
    summaryFields: {
      activeProblems: 'Hipertensión arterial esencial (sintético)\nControl ambulatorio en curso',
      recentEvents: 'Últimas 24 h: sin síntomas agudos (demo)',
      relevantLabs: 'Creatinina 0.9 mg/dL · Hb 14 g/dL · PA 128/82 mmHg (sintético)',
      activeMedications: 'Losartán 50 mg/día (demo)',
      pendingItems: 'Control presión en 7 días',
      clinicalAlerts: 'DEMO / SINTÉTICO — sin alertas reales',
    },
  },
  {
    patientId: 'a0000001-0000-4000-8000-000000000002',
    demoCaseCode: 'DEMO-002',
    displayName: 'Paciente Demo — Jorge Pérez',
    birthDate: '1972-11-08',
    sex: 'M',
    scenario: 'Pie diabético en control — DM2 (demo)',
    encounterId: 'b0000001-0000-4000-8000-000000000002',
    summaryFields: {
      activeProblems: 'Diabetes mellitus tipo 2 (sintético)\nDislipidemia mixta (sintético)',
      recentEvents: 'Últimas 24 h: glicemia capilar 142 mg/dL (demo)',
      relevantLabs: 'HbA1c 7.4 % · LDL 118 mg/dL (sintético)',
      activeMedications: 'Metformina 850 mg c/12 h · Atorvastatina 20 mg/noche (demo)',
      pendingItems: 'Laboratorio control en 3 meses',
      clinicalAlerts: 'DEMO / SINTÉTICO — revisar adherencia (ficticio)',
    },
  },
  {
    patientId: 'a0000001-0000-4000-8000-000000000003',
    demoCaseCode: 'DEMO-003',
    displayName: 'Paciente Demo — niña Inés R.',
    birthDate: '2018-06-21',
    sex: 'F',
    scenario: 'Asma bronquial pediátrica (control)',
    encounterId: 'b0000001-0000-4000-8000-000000000003',
    summaryFields: {
      activeProblems: 'Asma bronquial persistente leve (sintético)',
      recentEvents: 'Últimas 24 h: sin sibilancias; uso correcto de inhalador (demo)',
      relevantLabs: 'SatO2 98 % · Peso 22 kg (sintético)',
      activeMedications: 'Budesonida/formoterol inhalador (demo)',
      pendingItems: 'Control pediatría en 4 semanas',
      clinicalAlerts: 'DEMO / SINTÉTICO — paciente pediátrico ficticio',
    },
  },
  {
    patientId: 'a0000001-0000-4000-8000-000000000004',
    demoCaseCode: 'DEMO-004',
    displayName: 'Paciente Demo — Roberto N. Vega',
    birthDate: '1960-01-30',
    sex: 'M',
    scenario: 'Neumonía grave hospitalaria — postoperatorio (demo)',
    encounterId: 'b0000001-0000-4000-8000-000000000004',
    summaryFields: {
      activeProblems:
        'Postoperatorio día 2 — apendicectomía (sintético)\nDolor abdominal controlado (demo)',
      recentEvents: 'Últimas 24 h: tolera vía oral; sin fiebre (sintético)',
      relevantLabs: 'Leucocitos 9.2 ×10³/µL · PCR 12 mg/L (demo)',
      activeMedications: 'Paracetamol 1 g c/8 h · Profilaxis antibiótica finalizada (demo)',
      pendingItems: 'Alta prevista en 48 h si evolución favorable',
      clinicalAlerts: 'DEMO / SINTÉTICO — vigilancia de herida quirúrgica (ficticio)',
    },
  },
  {
    patientId: 'a0000001-0000-4000-8000-000000000005',
    demoCaseCode: 'DEMO-005',
    displayName: 'Paciente Demo — Elena M. Fuentes',
    birthDate: '1948-09-14',
    sex: 'F',
    scenario: 'Bacteriemia en evaluación — FA y polifarmacia (demo)',
    encounterId: 'b0000001-0000-4000-8000-000000000005',
    summaryFields: {
      activeProblems: 'Fibrilación auricular (sintético)\nPolifarmacia en revisión (demo)',
      recentEvents: 'Últimas 24 h: sin sangrados; INR en rango (sintético)',
      relevantLabs: 'INR 2.4 · Creatinina 1.1 mg/dL (demo)',
      activeMedications:
        'Warfarina 5 mg/día · Omeprazol 20 mg/día · Ceftriaxona 1 g IV (demo — conflicto alergia)',
      pendingItems: 'Revisión de interacciones farmacológicas',
      clinicalAlerts:
        'DEMO / SINTÉTICO — alergia a penicilina (ficticio) · riesgo de caídas documentado',
    },
  },
];

const FORBIDDEN_REAL_ID = /\b\d{7,8}[-\s]?\d{1,2}\b/;

export function getDemoCaseByPatientId(patientId: string): DemoClinicalCase | undefined {
  return DEMO_CLINICAL_CASES.find((c) => c.patientId === patientId);
}

export function getDemoCaseByCode(code: string): DemoClinicalCase | undefined {
  return DEMO_CLINICAL_CASES.find((c) => c.demoCaseCode === code);
}

export function assertDemoCasesInvariants(): string[] {
  const errors: string[] = [];
  if (DEMO_CLINICAL_CASES.length !== 5) {
    errors.push('Se requieren exactamente 5 casos demo');
  }
  const codes = new Set<string>();
  const ids = new Set<string>();
  for (const c of DEMO_CLINICAL_CASES) {
    if (!c.demoCaseCode.startsWith('DEMO-')) {
      errors.push(`Código demo inválido: ${c.demoCaseCode}`);
    }
    if (codes.has(c.demoCaseCode)) errors.push(`Código duplicado: ${c.demoCaseCode}`);
    if (ids.has(c.patientId)) errors.push(`UUID duplicado: ${c.patientId}`);
    codes.add(c.demoCaseCode);
    ids.add(c.patientId);
    if (FORBIDDEN_REAL_ID.test(c.displayName)) {
      errors.push(`Posible identificador real en nombre: ${c.displayName}`);
    }
    if (!c.displayName.includes('Demo') && !c.displayName.includes('demo')) {
      errors.push(`Nombre sin marca demo: ${c.displayName}`);
    }
    for (const v of Object.values(c.summaryFields)) {
      if (FORBIDDEN_REAL_ID.test(v)) {
        errors.push(`Posible ID real en resumen de ${c.demoCaseCode}`);
      }
    }
  }
  return errors;
}
