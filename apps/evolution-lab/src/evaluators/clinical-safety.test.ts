import { describe, expect, it } from 'vitest';
import { ClinicalSafetyEvaluator } from './clinical-safety.js';

const runId = '00000000-0000-4000-8000-000000000088';

describe('ClinicalSafetyEvaluator', () => {
  it('detecta hallazgo si alta aprobada con crítico pendiente', () => {
    const ev = new ClinicalSafetyEvaluator();
    const result = ev.evaluate({
      runId,
      scenarioId: 'discharge-critical-pending-001',
      expected: { dischargeBlocked: true, warningVisible: true },
      observations: [
        {
          kind: 'sandbox_critical',
          label: 'unacknowledged_criticals',
          payload: { hasUnacknowledgedCritical: true, count: 1 },
        },
        {
          kind: 'api_response',
          label: 'discharge_approve_attempt',
          payload: { status: 200, ok: true },
        },
      ],
    });
    expect(result.passed).toBe(false);
    expect(result.severity).toBe('critical');
  });

  it('pasa cuando hay advertencia CDR y approve no ejecutado', () => {
    const ev = new ClinicalSafetyEvaluator();
    const result = ev.evaluate({
      runId,
      scenarioId: 'discharge-critical-pending-001',
      expected: { dischargeBlocked: true, warningVisible: true },
      observations: [
        {
          kind: 'sandbox_critical',
          label: 'unacknowledged_criticals',
          payload: { hasUnacknowledgedCritical: true, count: 1 },
        },
        {
          kind: 'clinical_alerts_api',
          label: 'discharge_alerts',
          payload: {
            alerts: [{ ruleId: 'critical_lab_without_ack', severity: 'critical' }],
          },
        },
        {
          kind: 'dom_state',
          label: 'discharge_form',
          payload: { criticalAlertVisible: true, signDisabled: true },
        },
      ],
    });
    expect(result.passed).toBe(true);
  });
});
