/**
 * Casos SIM promovidos desde clinical-case-intel (MF-CASE-04).
 * IDs estables vía `stableSimCaseUuids` — alineados con `042_sim_clinical_cases_seed.sql`.
 * Regenerar: `npm run case-intel:export-fixtures -- --apply`
 */

import type { DemoClinicalCase } from './demoCases.js';
import { stableSimCaseUuids } from './simCaseIds.js';

export const SIM_CLINICAL_CASES: DemoClinicalCase[] = [
  {
    patientId: 'a0000002-0000-4000-8000-7e3ca20d97a4',
    demoCaseCode: 'SIM-HIPERTENSI-N-ac1e',
    displayName: "Paciente Sim — Camila R.",
    birthDate: '1978-04-15',
    sex: 'F',
    scenario: "Hipertensión arterial esencial (sintético)",
    encounterId: 'b0000002-0000-4000-8000-039d1a575718',
    summaryFields: {
      activeProblems: "Hipertensión arterial esencial (sintético)",
      recentEvents: "Últimas 24 h: evolución estable (sintético)",
      relevantLabs: "Blood pressure 142/88 mmHg (sintético)",
      activeMedications: "Losartan (demo) 50 mg daily",
      pendingItems: "Seguimiento ambulatorio en 7 días (demo)",
      clinicalAlerts: "SIM / SINTÉTICO — sin alertas reales",
    },
  },
  {
    patientId: 'a0000002-0000-4000-8000-15db40954d33',
    demoCaseCode: 'SIM-DIABETES-81dd',
    displayName: "Paciente Sim — Diego L.",
    birthDate: '1965-11-08',
    sex: 'M',
    scenario: "Diabetes mellitus tipo 2 (sintético)",
    encounterId: 'b0000002-0000-4000-8000-8fbbef759bcc',
    summaryFields: {
      activeProblems: "Diabetes mellitus tipo 2 (sintético)",
      recentEvents: "Últimas 24 h: evolución estable (sintético)",
      relevantLabs: "HbA1c 7.8 % (sintético)",
      activeMedications: "Metformin (demo) 850 mg BID",
      pendingItems: "Seguimiento ambulatorio en 7 días (demo)",
      clinicalAlerts: "SIM / SINTÉTICO — sin alertas reales",
    },
  },
  {
    patientId: 'a0000002-0000-4000-8000-e60ce57defe7',
    demoCaseCode: 'SIM-ASMA-BRONQUI-d583',
    displayName: "Paciente Sim — Valentina M.",
    birthDate: '1992-02-20',
    sex: 'F',
    scenario: "Asma bronquial persistente leve (sintético)",
    encounterId: 'b0000002-0000-4000-8000-fa002b535232',
    summaryFields: {
      activeProblems: "Asma bronquial persistente leve (sintético)",
      recentEvents: "Últimas 24 h: evolución estable (sintético)",
      relevantLabs: "Peak flow 310 L/min (sintético)",
      activeMedications: "Fluticasone/Salmeterol (demo) 1 inhalación BID",
      pendingItems: "Seguimiento ambulatorio en 7 días (demo)",
      clinicalAlerts: "SIM / SINTÉTICO — sin alertas reales",
    },
  },
  {
    patientId: 'a0000002-0000-4000-8000-f6391983bee4',
    demoCaseCode: 'SIM-NEUMON-A-ADQ-e60b',
    displayName: "Paciente Sim — Matías R.",
    birthDate: '1955-09-03',
    sex: 'M',
    scenario: "Neumonía adquirida en la comunidad (sintético)",
    encounterId: 'b0000002-0000-4000-8000-d1c991b33795',
    summaryFields: {
      activeProblems: "Neumonía adquirida en la comunidad (sintético)",
      recentEvents: "Últimas 24 h: evolución estable (sintético)",
      relevantLabs: "Temperature 38.4 Cel (sintético)",
      activeMedications: "Amoxicillin (demo) 500 mg TID",
      pendingItems: "Seguimiento ambulatorio en 7 días (demo)",
      clinicalAlerts: "SIM / SINTÉTICO — sin alertas reales",
    },
  },
  {
    patientId: 'a0000002-0000-4000-8000-ec9ac0c0edc7',
    demoCaseCode: 'SIM-FIBRILACI-N--80e0',
    displayName: "Paciente Sim — Valentina M.",
    birthDate: '1948-12-18',
    sex: 'F',
    scenario: "Fibrilación auricular (sintético)",
    encounterId: 'b0000002-0000-4000-8000-cdd30a2ab1ce',
    summaryFields: {
      activeProblems: "Fibrilación auricular (sintético)",
      recentEvents: "Últimas 24 h: evolución estable (sintético)",
      relevantLabs: "Heart rate 92 /min (sintético)",
      activeMedications: "Apixaban (demo) 5 mg BID",
      pendingItems: "Seguimiento ambulatorio en 7 días (demo)",
      clinicalAlerts: "SIM / SINTÉTICO — sin alertas reales",
    },
  },
  {
    patientId: 'a0000002-0000-4000-8000-706b253c066f',
    demoCaseCode: 'SIM-OBESIDAD-SIN-a015',
    displayName: "Paciente Sim — Andrés P.",
    birthDate: '1988-06-25',
    sex: 'M',
    scenario: "Obesidad (sintético)",
    encounterId: 'b0000002-0000-4000-8000-0a9f9b80298d',
    summaryFields: {
      activeProblems: "Obesidad (sintético)",
      recentEvents: "Últimas 24 h: evolución estable (sintético)",
      relevantLabs: "Body mass index 32.4 kg/m2 (sintético)",
      activeMedications: "Sin medicación activa registrada (sintético)",
      pendingItems: "Seguimiento ambulatorio en 7 días (demo)",
      clinicalAlerts: "SIM / SINTÉTICO — sin alertas reales",
    },
  },
  {
    patientId: 'a0000002-0000-4000-8000-a6195830689a',
    demoCaseCode: 'SIM-DISLIPIDEMIA-cd13',
    displayName: "Paciente Sim — Valentina M.",
    birthDate: '1970-01-30',
    sex: 'F',
    scenario: "Dislipidemia mixta (sintético)",
    encounterId: 'b0000002-0000-4000-8000-be93863498d2',
    summaryFields: {
      activeProblems: "Dislipidemia mixta (sintético)",
      recentEvents: "Últimas 24 h: evolución estable (sintético)",
      relevantLabs: "LDL cholesterol 168 mg/dL (sintético)",
      activeMedications: "Atorvastatin (demo) 20 mg nightly",
      pendingItems: "Seguimiento ambulatorio en 7 días (demo)",
      clinicalAlerts: "SIM / SINTÉTICO — sin alertas reales",
    },
  },
  {
    patientId: 'a0000002-0000-4000-8000-f093668ff9e7',
    demoCaseCode: 'SIM-EPOC-MODERAD-2b2f',
    displayName: "Paciente Sim — Andrés P.",
    birthDate: '1952-04-11',
    sex: 'M',
    scenario: "EPOC moderada (sintético)",
    encounterId: 'b0000002-0000-4000-8000-d577ab3340e5',
    summaryFields: {
      activeProblems: "EPOC moderada (sintético)",
      recentEvents: "Últimas 24 h: evolución estable (sintético)",
      relevantLabs: "FEV1 58 % predicted (sintético)",
      activeMedications: "Tiotropium (demo) 18 mcg daily",
      pendingItems: "Seguimiento ambulatorio en 7 días (demo)",
      clinicalAlerts: "SIM / SINTÉTICO — sin alertas reales",
    },
  },
  {
    patientId: 'a0000002-0000-4000-8000-c20352778c56',
    demoCaseCode: 'SIM-INSUFICIENCI-cd9f',
    displayName: "Paciente Sim — Daniela V.",
    birthDate: '1943-08-07',
    sex: 'F',
    scenario: "Insuficiencia cardíaca congestiva (sintético)",
    encounterId: 'b0000002-0000-4000-8000-9b799e9301b6',
    summaryFields: {
      activeProblems: "Insuficiencia cardíaca congestiva (sintético)",
      recentEvents: "Últimas 24 h: evolución estable (sintético)",
      relevantLabs: "BNP 420 pg/mL (sintético)",
      activeMedications: "Furosemide (demo) 40 mg daily",
      pendingItems: "Seguimiento ambulatorio en 7 días (demo)",
      clinicalAlerts: "SIM / SINTÉTICO — sin alertas reales",
    },
  },
  {
    patientId: 'a0000002-0000-4000-8000-ee68a3bec8e4',
    demoCaseCode: 'SIM-ASTHMA-c6be',
    displayName: "Paciente Sim — Matías R.",
    birthDate: '1998-07-14',
    sex: 'M',
    scenario: "Adulto joven con asma persistente en control ambulatorio (sintético)",
    encounterId: 'b0000002-0000-4000-8000-24a2012ffa8d',
    summaryFields: {
      activeProblems: "Asma bronquial persistente leve (sintético)",
      recentEvents: "Paciente masculino de 27 años con sibilancias intermitentes y disnea leve al esfuerzo. Sin fiebre ni expectoración purulenta. Refiere mejoría parcial con broncodilatador de rescate (sintético). (sintético)",
      relevantLabs: "Peak expiratory flow 320 L/min (sintético) · SpO2 97% en aire ambiente (sintético)",
      activeMedications: "Salbutamol (demo) 2 inhalaciones PRN · Budesonida (demo) 200 mcg BID",
      pendingItems: "Seguimiento ambulatorio en 7 días (demo)",
      clinicalAlerts: "SIM / SINTÉTICO — sin alertas reales",
    },
  }
];

const FORBIDDEN_REAL_ID = /\b\d{7,8}[-\s]?\d{1,2}\b/;

export function getSimCaseByCode(code: string): DemoClinicalCase | undefined {
  return SIM_CLINICAL_CASES.find((c) => c.demoCaseCode === code);
}

export function getSimCaseByPatientId(patientId: string): DemoClinicalCase | undefined {
  return SIM_CLINICAL_CASES.find((c) => c.patientId === patientId);
}

export function assertSimCasesInvariants(): string[] {
  const errors: string[] = [];
  const codes = new Set<string>();
  const ids = new Set<string>();
  for (const c of SIM_CLINICAL_CASES) {
    if (!c.demoCaseCode.startsWith('SIM-')) {
      errors.push(`Código SIM inválido: ${c.demoCaseCode}`);
    }
    const expected = stableSimCaseUuids(c.demoCaseCode);
    if (c.patientId !== expected.patientId) {
      errors.push(`patientId no alineado con stableSimCaseUuids: ${c.demoCaseCode}`);
    }
    if (c.encounterId !== expected.encounterId) {
      errors.push(`encounterId no alineado con stableSimCaseUuids: ${c.demoCaseCode}`);
    }
    if (codes.has(c.demoCaseCode)) errors.push(`Código duplicado: ${c.demoCaseCode}`);
    if (ids.has(c.patientId)) errors.push(`UUID duplicado: ${c.patientId}`);
    codes.add(c.demoCaseCode);
    ids.add(c.patientId);
    if (FORBIDDEN_REAL_ID.test(c.displayName)) {
      errors.push(`Posible identificador real en nombre: ${c.displayName}`);
    }
    if (!c.displayName.includes('Sim') && !c.displayName.includes('Demo')) {
      errors.push(`Nombre sin marca ficticia: ${c.displayName}`);
    }
  }
  return errors;
}
