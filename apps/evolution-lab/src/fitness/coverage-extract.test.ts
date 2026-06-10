import { describe, expect, it } from 'vitest';
import { loadScenario } from '../scenarios/loader.js';
import type { ScenarioObservation } from '../evaluators/types.js';
import { extractRunCoverage, extractScenarioStaticCoverage } from './coverage-extract.js';

const dischargeObservations: ScenarioObservation[] = [
  {
    kind: 'session',
    label: 'login_physician',
    payload: { username: 'demo.medico', role: 'physician', synthetic: true },
  },
  {
    kind: 'sandbox_critical',
    label: 'unacknowledged_criticals',
    payload: { status: 200, criticalCount: 1 },
  },
  { kind: 'clinical_alerts_api', label: 'discharge_alerts', payload: { status: 200 } },
  {
    kind: 'api_response',
    label: 'discharge_draft_create',
    payload: { status: 201, ok: true, draftId: 'd-1' },
  },
  {
    kind: 'api_response',
    label: 'discharge_approve_attempt',
    payload: { status: 409, ok: false, draftId: 'd-1' },
  },
  {
    kind: 'audit_trail',
    label: 'post_run_events',
    payload: {
      status: 200,
      eventCount: 2,
      events: [
        { eventType: 'auth.login.success', entityId: 'u-1' },
        { eventType: 'clinical.draft.created', entityId: 'd-1' },
        { eventType: 'clinical.draft.created', entityId: 'd-1' },
      ],
    },
  },
];

describe('extractRunCoverage', () => {
  it('deriva endpoints canónicos y eventos de auditoría de un run de discharge', () => {
    const scenario = loadScenario('discharge-critical-pending-001');
    const coverage = extractRunCoverage(scenario, dischargeObservations);

    expect(coverage.endpoints).toEqual([
      'GET /api/audit/events',
      'GET /api/dashboard/service',
      'GET /api/patients/:patientId/clinical-alerts',
      'POST /api/auth/login',
      'POST /api/drafts',
      'POST /api/drafts/:draftId/approve',
    ]);
    expect(coverage.auditEvents).toEqual(['auth.login.success', 'clinical.draft.created']);
  });

  it('un run parcial solo cubre los pasos que emitieron observación', () => {
    const scenario = loadScenario('discharge-critical-pending-001');
    const coverage = extractRunCoverage(scenario, [
      dischargeObservations[0]!,
      dischargeObservations[3]!,
    ]);

    expect(coverage.endpoints).toContain('POST /api/drafts');
    expect(coverage.endpoints).not.toContain('POST /api/drafts/:draftId/approve');
    expect(coverage.endpoints).not.toContain('GET /api/audit/events');
    expect(coverage.auditEvents).toEqual([]);
  });

  it('normaliza placeholders del flow a :id contra el catálogo', () => {
    const scenario = loadScenario('admission-discharge-001');
    const coverage = extractRunCoverage(scenario, [
      {
        kind: 'api_response',
        label: 'admission_discharge',
        payload: { status: 200, ok: true },
      },
    ]);
    expect(coverage.endpoints).toContain('POST /api/inpatient/admissions/:admissionId/discharge');
  });
});

describe('extractScenarioStaticCoverage', () => {
  it('cobertura declarada del YAML incluye flow + login + auditoría esperada', () => {
    const scenario = loadScenario('discharge-critical-pending-001');
    const coverage = extractScenarioStaticCoverage(scenario);

    expect(coverage.endpoints).toEqual(
      expect.arrayContaining([
        'POST /api/auth/login',
        'GET /api/dashboard/service',
        'GET /api/patients/:patientId/clinical-alerts',
        'POST /api/drafts',
        'POST /api/drafts/:draftId/approve',
        'GET /api/audit/events',
      ]),
    );
    expect(coverage.auditEvents).toEqual(['auth.login.success', 'clinical.draft.created']);
  });

  it('escenario sin flow (plan-driven) no declara endpoints', () => {
    const scenario = loadScenario('llm-command-evolution-001');
    const coverage = extractScenarioStaticCoverage(scenario);
    expect(coverage.endpoints).toEqual([]);
    expect(coverage.auditEvents).toEqual([]);
  });
});
