import { describe, expect, it } from 'vitest';
import { AuditCompletenessEvaluator } from './audit-completeness.js';
import { CdrConsistencyEvaluator } from './cdr-consistency.js';
import { buildEvaluatorsForScenario } from './deterministic.js';
import { createFindingsFromEvaluations } from '../findings/creator.js';
import type { ScenarioObservation } from './types.js';

const runId = '00000000-0000-4000-8000-000000000088';

function sandboxCritical(count: number): ScenarioObservation {
  return {
    kind: 'sandbox_critical',
    label: 'unacknowledged_criticals',
    payload: {
      hasUnacknowledgedCritical: count > 0,
      count,
      criticalIds: count > 0 ? ['f0000004-0000-4000-8000-000000000002'] : [],
    },
  };
}

function clinicalAlerts(alerts: Array<{ ruleId?: string; severity?: string }>) {
  return {
    kind: 'clinical_alerts_api',
    label: 'discharge_alerts',
    payload: { status: 200, alertCount: alerts.length, alerts },
  } satisfies ScenarioObservation;
}

describe('CdrConsistencyEvaluator', () => {
  const ev = new CdrConsistencyEvaluator();

  it('pasa cuando el crítico DB está reflejado en alerta CDR crítica', () => {
    const result = ev.evaluate({
      runId,
      scenarioId: 'discharge-critical-pending-001',
      expected: { cdrConsistent: true },
      observations: [
        sandboxCritical(1),
        clinicalAlerts([{ ruleId: 'critical_lab_without_ack', severity: 'critical' }]),
      ],
    });
    expect(result.passed).toBe(true);
  });

  it('falla high cuando DB tiene crítico pero CDR no lo refleja → finding accionable', () => {
    const result = ev.evaluate({
      runId,
      scenarioId: 'discharge-critical-pending-001',
      expected: { cdrConsistent: true },
      observations: [
        sandboxCritical(1),
        clinicalAlerts([{ ruleId: 'missing_followup', severity: 'warning' }]),
      ],
    });
    expect(result.passed).toBe(false);
    expect(result.severity).toBe('high');

    const findings = createFindingsFromEvaluations({
      runId,
      scenarioId: 'discharge-critical-pending-001',
      targetEnvironmentId: 'epis2-local-sandbox',
      evaluations: [result],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.category).toBe('clinical_safety');
    expect(findings[0]?.recommendedAction).toBe('generate_test');
    expect(findings[0]?.affectedComponents).toContain('packages/clinical-domain/cdr');
  });

  it('falla medium ante falso positivo CDR (alerta crítica sin crítico DB)', () => {
    const result = ev.evaluate({
      runId,
      scenarioId: 'discharge-critical-pending-001',
      expected: { cdrConsistent: true },
      observations: [
        sandboxCritical(0),
        clinicalAlerts([{ ruleId: 'critical_lab_without_ack', severity: 'critical' }]),
      ],
    });
    expect(result.passed).toBe(false);
    expect(result.severity).toBe('medium');
  });

  it('falla medium si faltan observaciones o el alerts API no respondió 200', () => {
    const missing = ev.evaluate({
      runId,
      scenarioId: 'x',
      expected: { cdrConsistent: true },
      observations: [sandboxCritical(1)],
    });
    expect(missing.passed).toBe(false);

    const degraded = ev.evaluate({
      runId,
      scenarioId: 'x',
      expected: { cdrConsistent: true },
      observations: [
        sandboxCritical(1),
        {
          kind: 'clinical_alerts_api',
          label: 'discharge_alerts',
          payload: { status: 503, alerts: [] },
        },
      ],
    });
    expect(degraded.passed).toBe(false);
    expect(degraded.severity).toBe('medium');
  });
});

const DRAFT_ID = 'dddd0001-0000-4000-8000-000000000001';

function auditTrail(events: Array<{ eventType: string; entityId?: string }>) {
  return {
    kind: 'audit_trail',
    label: 'post_run_events',
    payload: { eventCount: events.length, events },
  } satisfies ScenarioObservation;
}

function approveAttempt(status: number): ScenarioObservation {
  return {
    kind: 'api_response',
    label: 'discharge_approve_attempt',
    payload: { status, ok: status < 400, draftId: DRAFT_ID },
  };
}

describe('AuditCompletenessEvaluator', () => {
  const ev = new AuditCompletenessEvaluator();
  const expected = {
    auditMustInclude: ['auth.login.success', 'clinical.draft.created'],
    auditMustNotInclude: ['clinical.draft.approved'],
  };

  it('pasa con patrones presentes y sin evento prohibido para la acción', () => {
    const result = ev.evaluate({
      runId,
      scenarioId: 'discharge-critical-pending-001',
      expected,
      actionObservation: 'discharge_approve_attempt',
      observations: [
        approveAttempt(422),
        auditTrail([
          { eventType: 'auth.login.success' },
          { eventType: 'clinical.draft.created', entityId: DRAFT_ID },
          // Approved de otro draft (otro run) no debe penalizar:
          { eventType: 'clinical.draft.approved', entityId: 'otro-draft' },
        ]),
      ],
    });
    expect(result.passed).toBe(true);
  });

  it('falla medium listando patrones faltantes', () => {
    const result = ev.evaluate({
      runId,
      scenarioId: 'discharge-critical-pending-001',
      expected,
      observations: [auditTrail([{ eventType: 'auth.login.success' }])],
    });
    expect(result.passed).toBe(false);
    expect(result.severity).toBe('medium');
    expect(result.details?.missing).toEqual(['clinical.draft.created']);
  });

  it('falla high si la acción bloqueada quedó registrada como aprobada', () => {
    const result = ev.evaluate({
      runId,
      scenarioId: 'discharge-critical-pending-001',
      expected,
      actionObservation: 'discharge_approve_attempt',
      observations: [
        approveAttempt(200),
        auditTrail([
          { eventType: 'auth.login.success' },
          { eventType: 'clinical.draft.created', entityId: DRAFT_ID },
          { eventType: 'clinical.draft.approved', entityId: DRAFT_ID },
        ]),
      ],
    });
    expect(result.passed).toBe(false);
    expect(result.severity).toBe('high');
    expect(result.details?.forbidden).toEqual(['clinical.draft.approved']);
  });

  it('falla medium sin trail de auditoría', () => {
    const result = ev.evaluate({
      runId,
      scenarioId: 'x',
      expected,
      observations: [],
    });
    expect(result.passed).toBe(false);
  });
});

describe('buildEvaluatorsForScenario auto-add Sprint 5', () => {
  it('agrega cdr_consistency y audit_completeness desde expected', () => {
    const evaluators = buildEvaluatorsForScenario({
      evaluators: ['functional'],
      expected: {
        cdrConsistent: true,
        auditMustInclude: ['clinical.draft.created'],
      },
    });
    const ids = evaluators.map((e) => e.id);
    expect(ids).toContain('cdr_consistency');
    expect(ids).toContain('audit_completeness');
  });
});
