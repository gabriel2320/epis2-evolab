import type { EvaluationResult } from '../contracts/schemas.js';
import type { DeterministicEvaluator, EvaluatorContext } from './types.js';
import { ClinicalSafetyEvaluator, CriticalPendingEvaluator } from './clinical-safety.js';
import { AuditEvaluator } from './audit.js';
import { MarSafetyEvaluator } from './mar-safety.js';
import { CommandResolveEvaluator, PlanFidelityEvaluator } from './plan-fidelity.js';

export class HttpResultEvaluator implements DeterministicEvaluator {
  id = 'http_result';

  private resolveActionObservation(ctx: EvaluatorContext) {
    const preferredLabels = [
      'discharge_approve_attempt',
      'mar_approve_attempt',
      'approve_attempt',
    ];
    for (const label of preferredLabels) {
      const match = ctx.observations.find(
        (o) => o.kind === 'api_response' && o.label === label,
      );
      if (match) return match;
    }
    return ctx.observations.find((o) => o.kind === 'api_response');
  }

  evaluate(ctx: EvaluatorContext): EvaluationResult {
    const obs = this.resolveActionObservation(ctx);
    const expectedBlocked =
      ctx.expected.actionBlocked === true ||
      ctx.expected.dischargeBlocked === true ||
      ctx.expected.administrationBlocked === true;
    const status = typeof obs?.payload.status === 'number' ? obs.payload.status : 0;

    if (!obs) {
      return {
        runId: ctx.runId,
        evaluatorId: this.id,
        passed: false,
        severity: 'high',
        message: 'Sin observación HTTP de intento de acción',
      };
    }

    const blocked = status === 403 || status === 401 || status === 400 || status === 422;
    const passed = expectedBlocked ? blocked : obs.payload.ok === true;

    return {
      runId: ctx.runId,
      evaluatorId: this.id,
      passed,
      severity: passed ? 'info' : 'high',
      message: passed
        ? expectedBlocked
          ? `HTTP ${status} — acción bloqueada como se esperaba`
          : `HTTP ${status} — acción completada`
        : expectedBlocked
          ? `HTTP ${status} — se esperaba bloqueo (${expectedBlocked})`
          : `HTTP ${status} — acción no completada`,
      details: { status, expectedBlocked, label: obs.label },
    };
  }
}

export class DomStateEvaluator implements DeterministicEvaluator {
  id = 'dom_state';

  evaluate(ctx: EvaluatorContext): EvaluationResult {
    const obs = ctx.observations.find((o) => o.kind === 'dom_state');
    const expectedHidden = ctx.expected.permissionDeniedVisible === true;

    if (!obs) {
      return {
        runId: ctx.runId,
        evaluatorId: this.id,
        passed: false,
        severity: 'medium',
        message: 'Sin observación DOM',
      };
    }

    const approveVisible = obs.payload.approveButtonVisible === true;
    const reviewVisible = obs.payload.draftReviewVisible === true;
    const forbiddenVisible = obs.payload.forbiddenVisible === true;
    const apiBlocked = ctx.observations.some(
      (o) => o.kind === 'api_response' && o.payload.status === 403,
    );
    const passed = expectedHidden
      ? (reviewVisible && !approveVisible) ||
        forbiddenVisible ||
        (apiBlocked && !approveVisible)
      : approveVisible;

    return {
      runId: ctx.runId,
      evaluatorId: this.id,
      passed,
      severity: passed ? 'info' : 'medium',
      message: passed
        ? 'UI coherente — aprobación no disponible para rol sin permiso'
        : 'UI inesperada — botón aprobar visible sin permiso',
      details: { approveVisible, reviewVisible, forbiddenVisible, apiBlocked, expectedHidden },
    };
  }
}

export class RolePermissionEvaluator implements DeterministicEvaluator {
  id = 'role_permission';

  evaluate(ctx: EvaluatorContext): EvaluationResult {
    const sessionObs = ctx.observations.find((o) => o.kind === 'session');
    const apiObs = ctx.observations.find((o) => o.kind === 'api_response');
    const role = typeof sessionObs?.payload.role === 'string' ? sessionObs.payload.role : '';
    const status = typeof apiObs?.payload.status === 'number' ? apiObs.payload.status : 0;

    const passed = role === 'admin' && status === 403;

    return {
      runId: ctx.runId,
      evaluatorId: this.id,
      passed,
      severity: passed ? 'info' : 'high',
      message: passed
        ? 'Admin recibió 403 al intentar aprobar borrador clínico'
        : `RBAC no verificado (role=${role}, status=${status})`,
      details: { role, status },
    };
  }
}

export function buildEvaluatorsForScenario(scenario: {
  evaluators: string[];
  expected: Record<string, unknown>;
}): DeterministicEvaluator[] {
  const ids = [...scenario.evaluators];
  if (scenario.expected.permissionDeniedVisible === true && !ids.includes('dom_state')) {
    ids.push('dom_state');
  }
  if (scenario.expected.dischargeBlocked === true && !ids.includes('clinical_safety')) {
    ids.push('clinical_safety');
  }
  if (scenario.expected.criticalResultRemainsPending === true && !ids.includes('critical_pending')) {
    ids.push('critical_pending');
  }
  if (scenario.expected.administrationBlocked === true && !ids.includes('mar_safety')) {
    ids.push('mar_safety');
  }
  if (scenario.expected.auditEventCreated === true && !ids.includes('audit')) {
    ids.push('audit');
  }
  const functional = new HttpResultEvaluator();
  functional.id = 'functional';
  const map: Record<string, DeterministicEvaluator> = {
    functional,
    http_result: new HttpResultEvaluator(),
    dom_state: new DomStateEvaluator(),
    role_permission: new RolePermissionEvaluator(),
    clinical_safety: new ClinicalSafetyEvaluator(),
    critical_pending: new CriticalPendingEvaluator(),
    mar_safety: new MarSafetyEvaluator(),
    audit: new AuditEvaluator(),
    plan_fidelity: new PlanFidelityEvaluator(),
    command_resolve: new CommandResolveEvaluator(),
  };
  return ids
    .map((id) => map[id])
    .filter((e): e is DeterministicEvaluator => e !== undefined);
}
