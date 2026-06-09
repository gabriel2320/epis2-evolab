import { describe, expect, it } from 'vitest';
import {
  DomStateEvaluator,
  HttpResultEvaluator,
  RolePermissionEvaluator,
} from './deterministic.js';

const runId = '00000000-0000-4000-8000-000000000099';

describe('deterministic evaluators', () => {
  it('HttpResultEvaluator detecta 403 como bloqueo esperado', () => {
    const ev = new HttpResultEvaluator();
    const result = ev.evaluate({
      runId,
      scenarioId: 'test',
      expected: { actionBlocked: true },
      observations: [
        { kind: 'api_response', label: 'x', payload: { status: 403, ok: false } },
      ],
    });
    expect(result.passed).toBe(true);
  });

  it('DomStateEvaluator acepta bloqueo API sin botón aprobar', () => {
    const ev = new DomStateEvaluator();
    const result = ev.evaluate({
      runId,
      scenarioId: 'test',
      expected: { permissionDeniedVisible: true },
      observations: [
        { kind: 'dom_state', label: 'x', payload: { draftReviewVisible: false, approveButtonVisible: false } },
        { kind: 'api_response', label: 'x', payload: { status: 403 } },
      ],
    });
    expect(result.passed).toBe(true);
  });

  it('HttpResultEvaluator prioriza discharge_approve_attempt', () => {
    const ev = new HttpResultEvaluator();
    const result = ev.evaluate({
      runId,
      scenarioId: 'discharge-critical-pending-001',
      expected: { dischargeBlocked: true },
      observations: [
        { kind: 'api_response', label: 'discharge_draft_create', payload: { status: 201, ok: true } },
        { kind: 'api_response', label: 'discharge_approve_attempt', payload: { status: 200, ok: true } },
      ],
    });
    expect(result.passed).toBe(false);
    expect(result.details?.status).toBe(200);
  });

  it('RolePermissionEvaluator valida admin + 403', () => {
    const ev = new RolePermissionEvaluator();
    const result = ev.evaluate({
      runId,
      scenarioId: 'test',
      expected: {},
      observations: [
        { kind: 'session', label: 'x', payload: { role: 'admin' } },
        { kind: 'api_response', label: 'x', payload: { status: 403 } },
      ],
    });
    expect(result.passed).toBe(true);
  });
});
