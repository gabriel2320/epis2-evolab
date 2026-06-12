import { describe, expect, it } from 'vitest';
import type { ScenarioObservation } from './types.js';
import { evaluateMetamorphicRelation } from './metamorphic.js';
import { loadRelation } from '../scenarios/relation-loader.js';

function censusObs(label: string, fields: Record<string, unknown>): ScenarioObservation {
  return { kind: 'census_snapshot', label, payload: fields };
}

function apiObs(
  label: string,
  status: number,
  extra: Record<string, unknown> = {},
): ScenarioObservation {
  return {
    kind: 'api_response',
    label,
    payload: { status, ok: status >= 200 && status < 300, ...extra },
  };
}

describe('metamorphic evaluator', () => {
  it('snapshot_equal pasa cuando campos coinciden (MR-01)', () => {
    const relation = loadRelation('mr-census-inversion-001');
    const census = { bedCount: 10, occupiedCount: 3, availableCount: 7, demoPatientListed: false };
    const result = evaluateMetamorphicRelation({
      relation,
      correlationId: 'corr-1',
      source: {
        runId: 'run-src',
        scenarioId: 'admission-discharge-001',
        observations: [
          censusObs('census_baseline', census),
          censusObs('census_after_admission', { ...census, demoPatientListed: true }),
          censusObs('census_after_discharge', census),
        ],
        finalStatus: 'completed',
      },
      followUps: [],
    });
    expect(result.passed).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it('snapshot_equal falla cuando occupiedCount difiere', () => {
    const relation = loadRelation('mr-census-inversion-001');
    const result = evaluateMetamorphicRelation({
      relation,
      correlationId: 'corr-2',
      source: {
        runId: 'run-src',
        scenarioId: 'admission-discharge-001',
        observations: [
          censusObs('census_baseline', { bedCount: 10, occupiedCount: 2, availableCount: 8 }),
          censusObs('census_after_admission', { demoPatientListed: true }),
          censusObs('census_after_discharge', {
            bedCount: 10,
            occupiedCount: 3,
            availableCount: 7,
          }),
        ],
        finalStatus: 'completed',
      },
      followUps: [],
    });
    expect(result.passed).toBe(false);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it('outcome_implication pasa con monotonicidad RBAC (MR-02)', () => {
    const relation = loadRelation('mr-permission-monotonicity-001');
    const result = evaluateMetamorphicRelation({
      relation,
      correlationId: 'corr-3',
      source: {
        runId: 'run-src',
        scenarioId: 'role-nurse-approve-001',
        observations: [apiObs('nurse_approve_attempt', 200)],
        finalStatus: 'completed',
      },
      followUps: [
        {
          runId: 'run-fu',
          scenarioId: 'role-nurse-approve-001',
          observations: [apiObs('nurse_approve_attempt', 403)],
          finalStatus: 'completed',
        },
      ],
    });
    expect(result.passed).toBe(true);
  });

  it('outcome_implication es vacua si premisa no alcanza allowed', () => {
    const relation = loadRelation('mr-permission-monotonicity-001');
    const result = evaluateMetamorphicRelation({
      relation,
      correlationId: 'corr-4',
      source: {
        runId: 'run-src',
        scenarioId: 'role-nurse-approve-001',
        observations: [apiObs('nurse_approve_attempt', 403)],
        finalStatus: 'completed',
      },
      followUps: [
        {
          runId: 'run-fu',
          scenarioId: 'role-nurse-approve-001',
          observations: [apiObs('nurse_approve_attempt', 403)],
          finalStatus: 'completed',
        },
      ],
    });
    const implication = result.evaluations.find((e) => e.details?.clause === 'outcome_implication');
    expect(implication?.passed).toBe(true);
    expect(implication?.details?.vacuous).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it('invariant_repeat detecta status distinto en follow-ups (MR-03)', () => {
    const relation = loadRelation('mr-blocked-idempotence-001');
    const result = evaluateMetamorphicRelation({
      relation,
      correlationId: 'corr-5',
      source: {
        runId: 'run-src',
        scenarioId: 'role-nurse-approve-001',
        observations: [
          apiObs('nurse_approve_attempt', 403, { draftId: 'draft-1' }),
          { kind: 'audit_trail', label: 'audit', payload: { events: [] } },
        ],
        finalStatus: 'completed',
      },
      followUps: [
        {
          runId: 'run-fu-1',
          scenarioId: 'role-nurse-approve-001',
          observations: [
            apiObs('nurse_approve_attempt', 200, { draftId: 'draft-1' }),
            { kind: 'audit_trail', label: 'audit', payload: { events: [] } },
          ],
          finalStatus: 'completed',
        },
      ],
    });
    expect(result.passed).toBe(false);
  });

  it('audit_delta falla si aparece clinical.draft.approved prohibido', () => {
    const relation = loadRelation('mr-blocked-idempotence-001');
    const result = evaluateMetamorphicRelation({
      relation,
      correlationId: 'corr-6',
      source: {
        runId: 'run-src',
        scenarioId: 'role-nurse-approve-001',
        observations: [
          apiObs('nurse_approve_attempt', 403, { draftId: 'draft-abc' }),
          {
            kind: 'audit_trail',
            label: 'audit',
            payload: {
              events: [{ eventType: 'clinical.draft.approved', entityId: 'draft-abc' }],
            },
          },
        ],
        finalStatus: 'completed',
      },
      followUps: [],
    });
    expect(result.passed).toBe(false);
    expect(result.evaluations.some((e) => e.details?.clause === 'audit_delta' && !e.passed)).toBe(
      true,
    );
  });

  it('delta exige conteo de drafts estable entre source y follow-up (MR-03)', () => {
    const relation = loadRelation('mr-blocked-idempotence-001');
    const countObs = (total: number): ScenarioObservation => ({
      kind: 'drafts_count',
      label: 'drafts_count',
      payload: { total, ok: true, status: 200 },
    });
    const pass = evaluateMetamorphicRelation({
      relation,
      correlationId: 'corr-delta-ok',
      source: {
        runId: 'run-src',
        scenarioId: 'role-nurse-approve-001',
        observations: [
          apiObs('nurse_approve_attempt', 403, { draftId: 'draft-1' }),
          countObs(1),
          { kind: 'audit_trail', label: 'audit', payload: { events: [] } },
        ],
        finalStatus: 'completed',
      },
      followUps: [
        {
          runId: 'run-fu-1',
          scenarioId: 'role-nurse-approve-001',
          observations: [
            apiObs('nurse_approve_attempt', 403, { draftId: 'draft-1' }),
            countObs(1),
            { kind: 'audit_trail', label: 'audit', payload: { events: [] } },
          ],
          finalStatus: 'completed',
        },
      ],
    });
    expect(pass.passed).toBe(true);
    expect(pass.evaluations.some((e) => e.details?.clause === 'delta' && e.passed)).toBe(true);

    const fail = evaluateMetamorphicRelation({
      relation,
      correlationId: 'corr-delta-fail',
      source: {
        runId: 'run-src',
        scenarioId: 'role-nurse-approve-001',
        observations: [countObs(1)],
        finalStatus: 'completed',
      },
      followUps: [
        {
          runId: 'run-fu-1',
          scenarioId: 'role-nurse-approve-001',
          observations: [countObs(2)],
          finalStatus: 'completed',
        },
      ],
    });
    expect(fail.passed).toBe(false);
    expect(fail.evaluations.some((e) => e.details?.clause === 'delta' && !e.passed)).toBe(true);
  });

  it('audit_delta required detecta evento nuevo en follow-up (MR-04)', () => {
    const relation = loadRelation('mr-audit-conservation-001');
    const result = evaluateMetamorphicRelation({
      relation,
      correlationId: 'corr-audit-req',
      source: {
        runId: 'run-src',
        scenarioId: 'census-service-integrity-001',
        observations: [
          {
            kind: 'audit_trail',
            label: 'audit',
            payload: { events: [{ eventType: 'auth.login.success', entityId: 'u1' }] },
          },
        ],
        finalStatus: 'completed',
      },
      followUps: [
        {
          runId: 'run-fu',
          scenarioId: 'role-nurse-approve-001',
          observations: [
            apiObs('nurse_approve_attempt', 403, { draftId: 'draft-1' }),
            {
              kind: 'audit_trail',
              label: 'audit',
              payload: {
                events: [
                  { eventType: 'auth.login.success', entityId: 'u1' },
                  { eventType: 'clinical.draft.created', entityId: 'draft-1' },
                ],
              },
            },
          ],
          finalStatus: 'completed',
        },
      ],
    });
    expect(result.evaluations.some((e) => e.details?.clause === 'audit_delta' && e.passed)).toBe(
      true,
    );
  });

  it('delta critical_count −1 tras acknowledge (MR-07)', () => {
    const relation = loadRelation('mr-critical-ack-delta-001');
    const critObs = (count: number): ScenarioObservation => ({
      kind: 'sandbox_critical',
      label: 'critical_count',
      payload: { count, hasUnacknowledgedCritical: count > 0, criticalIds: [], labels: [] },
    });
    const result = evaluateMetamorphicRelation({
      relation,
      correlationId: 'corr-crit',
      source: {
        runId: 'run-src',
        scenarioId: 'critical-ack-snapshot-001',
        observations: [critObs(1)],
        finalStatus: 'completed',
      },
      followUps: [
        {
          runId: 'run-fu',
          scenarioId: 'critical-acknowledge-001',
          observations: [
            apiObs('critical_ack_attempt', 200),
            critObs(0),
            {
              kind: 'audit_trail',
              label: 'audit',
              payload: { events: [{ eventType: 'critical.acknowledged', entityId: 'crit-1' }] },
            },
          ],
          finalStatus: 'completed',
        },
      ],
    });
    expect(result.passed).toBe(true);
  });

  it('par no evaluable ante fallo de infraestructura', () => {
    const relation = loadRelation('mr-census-inversion-001');
    const result = evaluateMetamorphicRelation({
      relation,
      correlationId: 'corr-7',
      source: {
        runId: 'run-src',
        scenarioId: 'admission-discharge-001',
        observations: [],
        finalStatus: 'failed',
      },
      followUps: [],
    });
    expect(result.passed).toBe(false);
    expect(result.evaluations[0]?.message).toContain('no evaluable');
    expect(result.findings).toHaveLength(0);
  });
});
