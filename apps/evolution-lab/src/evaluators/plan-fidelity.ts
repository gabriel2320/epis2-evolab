import type { EvaluationResult } from '../contracts/schemas.js';
import type { DeterministicEvaluator, EvaluatorContext } from './types.js';

export class PlanFidelityEvaluator implements DeterministicEvaluator {
  id = 'plan_fidelity';

  evaluate(ctx: EvaluatorContext): EvaluationResult {
    const summary = ctx.observations.find(
      (o) => o.kind === 'plan_execution' && o.label === 'summary',
    );
    const steps = ctx.observations.filter((o) => o.kind === 'plan_step' || o.kind === 'observe');

    if (!summary && steps.length === 0) {
      return {
        runId: ctx.runId,
        evaluatorId: this.id,
        passed: false,
        severity: 'high',
        message: 'Sin ejecución de plan registrada',
      };
    }

    const total = Number(summary?.payload.totalSteps ?? steps.length);
    const failed = Number(summary?.payload.failed ?? 0);
    const succeeded = Number(summary?.payload.succeeded ?? total - failed);
    const passed = failed === 0 && succeeded > 0;

    return {
      runId: ctx.runId,
      evaluatorId: this.id,
      passed,
      severity: passed ? 'info' : 'medium',
      message: passed
        ? `Plan ejecutado: ${succeeded}/${total} pasos OK`
        : `Plan parcial: ${succeeded}/${total} pasos OK, ${failed} fallidos`,
      details: { total, succeeded, failed },
    };
  }
}

export class CommandResolveEvaluator implements DeterministicEvaluator {
  id = 'command_resolve';

  evaluate(ctx: EvaluatorContext): EvaluationResult {
    const expected = ctx.expected.commandResolved === true;
    const obs = ctx.observations.find(
      (o) => o.kind === 'api_response' && o.label === 'command_resolve',
    );

    if (!obs) {
      return {
        runId: ctx.runId,
        evaluatorId: this.id,
        passed: !expected,
        severity: expected ? 'high' : 'info',
        message: expected ? 'Sin respuesta de command resolve' : 'Command resolve no requerido',
      };
    }

    const resolved = obs.payload.commandResolved === true;
    const routePath = typeof obs.payload.routePath === 'string' ? obs.payload.routePath : '';
    const evolutionRoute = routePath.includes('evolucion');
    const passed = expected ? resolved && evolutionRoute : true;

    return {
      runId: ctx.runId,
      evaluatorId: this.id,
      passed,
      severity: passed ? 'info' : 'high',
      message: passed
        ? `Comando resuelto → ${routePath}`
        : `Comando no resolvió evolución (resolved=${resolved}, route=${routePath || '?'})`,
      details: { resolved, routePath, status: obs.payload.status },
    };
  }
}
