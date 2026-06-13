import type { EvaluationResult, ScenarioDefinition } from '../contracts/schemas.js';
import type { DeterministicEvaluator, EvaluatorContext } from './types.js';
import { ClinicalSafetyEvaluator, CriticalPendingEvaluator } from './clinical-safety.js';
import { AuditEvaluator } from './audit.js';
import { MarSafetyEvaluator } from './mar-safety.js';
import { CommandResolveEvaluator, PlanFidelityEvaluator } from './plan-fidelity.js';
import { CensusIntegrityEvaluator } from './census-integrity.js';
import { CdrConsistencyEvaluator } from './cdr-consistency.js';
import { AuditCompletenessEvaluator } from './audit-completeness.js';
import { NavigationReachableEvaluator } from './navigation-reachable.js';
import { isBrowserStep } from '../step-engine/schema.js';

export class HttpResultEvaluator implements DeterministicEvaluator {
  id = 'http_result';

  private resolveActionObservation(ctx: EvaluatorContext) {
    if (ctx.actionObservation) {
      const declared = ctx.observations.find(
        (o) => o.kind === 'api_response' && o.label === ctx.actionObservation,
      );
      if (declared) return declared;
    }
    // Heurística legacy para escenarios sin actionObservation declarado.
    const preferredLabels = ['discharge_approve_attempt', 'mar_approve_attempt', 'approve_attempt'];
    for (const label of preferredLabels) {
      const match = ctx.observations.find((o) => o.kind === 'api_response' && o.label === label);
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

    const blocked =
      status === 403 || status === 401 || status === 400 || status === 409 || status === 422;
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
      ? (reviewVisible && !approveVisible) || forbiddenVisible || (apiBlocked && !approveVisible)
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

/** Evalúa shell visual EPIS2 (modo papel / clásico dual) vía observaciones dom_state. */
export class VisualShellEvaluator implements DeterministicEvaluator {
  id = 'visual_shell';

  evaluate(ctx: EvaluatorContext): EvaluationResult {
    const obs = ctx.observations.find((o) => o.kind === 'dom_state');
    if (!obs) {
      return {
        runId: ctx.runId,
        evaluatorId: this.id,
        passed: false,
        severity: 'medium',
        message: 'Sin observación DOM para shell visual',
      };
    }

    const payload = obs.payload;
    const checks: Array<{ key: string; ok: boolean }> = [];

    if (ctx.expected.paperShellVisible === true) {
      checks.push({
        key: 'paperShellVisible',
        ok: payload.paperTemplateVisible === true,
      });
    }
    if (ctx.expected.traditionalShellVisible === true) {
      checks.push({
        key: 'traditionalShellVisible',
        ok: payload.traditionalShellVisible === true,
      });
    }
    if (ctx.expected.classicMd3ShellVisible === true) {
      checks.push({
        key: 'classicMd3ShellVisible',
        ok: payload.classicMd3ShellVisible === true,
      });
    }
    if (ctx.expected.chartModeSwitchVisible === true) {
      const switchOk =
        payload.paperModeSwitchActive === true || payload.traditionalModeSwitchActive === true;
      checks.push({ key: 'chartModeSwitchVisible', ok: switchOk });
    }

    if (checks.length === 0) {
      return {
        runId: ctx.runId,
        evaluatorId: this.id,
        passed: true,
        severity: 'info',
        message: 'Sin expectativas visuales declaradas',
      };
    }

    const passed = checks.every((c) => c.ok);
    const failed = checks.filter((c) => !c.ok).map((c) => c.key);

    return {
      runId: ctx.runId,
      evaluatorId: this.id,
      passed,
      severity: passed ? 'info' : 'medium',
      message: passed
        ? 'Shell visual EPIS2 coherente con el modo esperado'
        : `Shell visual incompleto: ${failed.join(', ')}`,
      details: { checks, url: payload.url },
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

export type ScenarioEvaluatorInput = {
  evaluators: string[];
  expected: Record<string, unknown>;
  flow?: ScenarioDefinition['flow'];
  processNodeId?: string;
  commandIntent?: string;
};

export function scenarioEvaluatorInput(scenario: ScenarioDefinition): ScenarioEvaluatorInput {
  return {
    evaluators: scenario.evaluators,
    expected: scenario.expected,
    ...(scenario.flow !== undefined ? { flow: scenario.flow } : {}),
    ...(scenario.processNodeId !== undefined ? { processNodeId: scenario.processNodeId } : {}),
    ...(scenario.commandIntent !== undefined ? { commandIntent: scenario.commandIntent } : {}),
  };
}

export function buildEvaluatorsForScenario(scenario: ScenarioEvaluatorInput): DeterministicEvaluator[] {
  const ids = [...scenario.evaluators];
  if (scenario.expected.permissionDeniedVisible === true && !ids.includes('dom_state')) {
    ids.push('dom_state');
  }
  if (scenario.expected.dischargeBlocked === true && !ids.includes('clinical_safety')) {
    ids.push('clinical_safety');
  }
  if (
    scenario.expected.criticalResultRemainsPending === true &&
    !ids.includes('critical_pending')
  ) {
    ids.push('critical_pending');
  }
  if (scenario.expected.administrationBlocked === true && !ids.includes('mar_safety')) {
    ids.push('mar_safety');
  }
  if (scenario.expected.auditEventCreated === true && !ids.includes('audit')) {
    ids.push('audit');
  }
  if (scenario.expected.cdrConsistent === true && !ids.includes('cdr_consistency')) {
    ids.push('cdr_consistency');
  }
  if (
    (Array.isArray(scenario.expected.auditMustInclude) ||
      Array.isArray(scenario.expected.auditMustNotInclude)) &&
    !ids.includes('audit_completeness')
  ) {
    ids.push('audit_completeness');
  }
  if (
    (scenario.expected.paperShellVisible === true ||
      scenario.expected.traditionalShellVisible === true ||
      scenario.expected.classicMd3ShellVisible === true ||
      scenario.expected.chartModeSwitchVisible === true) &&
    !ids.includes('visual_shell')
  ) {
    ids.push('visual_shell');
  }
  const hasBrowser = (scenario.flow ?? []).some((step) => isBrowserStep(step));
  if (
    (hasBrowser || scenario.processNodeId || scenario.commandIntent) &&
    !ids.includes('navigation_reachable')
  ) {
    ids.push('navigation_reachable');
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
    census_integrity: new CensusIntegrityEvaluator(),
    cdr_consistency: new CdrConsistencyEvaluator(),
    audit_completeness: new AuditCompletenessEvaluator(),
    visual_shell: new VisualShellEvaluator(),
    navigation_reachable: new NavigationReachableEvaluator(),
  };
  return ids.map((id) => map[id]).filter((e): e is DeterministicEvaluator => e !== undefined);
}
