import type { DeterministicEvaluator, EvaluatorContext } from './types.js';
import type { EvaluationResult } from '../contracts/schemas.js';

type AuditEvent = { eventType?: string; entityId?: string };

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Completitud de auditoría post-acción:
 * - expected.auditMustInclude: patrones que deben aparecer en eventType (substring).
 * - expected.auditMustNotInclude: patrones prohibidos para la entidad de la acción
 *   (correlados por entityId === draftId de la actionObservation; el trail comparte
 *   eventos de otros runs, por eso no se evalúan de forma global).
 */
export class AuditCompletenessEvaluator implements DeterministicEvaluator {
  id = 'audit_completeness';

  evaluate(ctx: EvaluatorContext): EvaluationResult {
    const mustInclude = stringArray(ctx.expected.auditMustInclude);
    const mustNotInclude = stringArray(ctx.expected.auditMustNotInclude);

    if (mustInclude.length === 0 && mustNotInclude.length === 0) {
      return {
        runId: ctx.runId,
        evaluatorId: this.id,
        passed: true,
        severity: 'info',
        message: 'Sin requisitos de completitud de auditoría declarados',
      };
    }

    const trail = ctx.observations.find((o) => o.kind === 'audit_trail');
    const events = Array.isArray(trail?.payload.events)
      ? (trail.payload.events as AuditEvent[])
      : [];

    if (!trail || events.length === 0) {
      return {
        runId: ctx.runId,
        evaluatorId: this.id,
        passed: false,
        severity: 'medium',
        message: 'Sin eventos de auditoría capturados — completitud no verificable',
        details: { mustInclude, eventCount: events.length },
      };
    }

    const missing = mustInclude.filter(
      (pattern) => !events.some((e) => e.eventType?.includes(pattern)),
    );

    const action = ctx.actionObservation
      ? ctx.observations.find((o) => o.kind === 'api_response' && o.label === ctx.actionObservation)
      : undefined;
    const actionEntityId =
      typeof action?.payload.draftId === 'string' ? action.payload.draftId : undefined;

    const forbidden = actionEntityId
      ? mustNotInclude.filter((pattern) =>
          events.some((e) => e.eventType?.includes(pattern) && e.entityId === actionEntityId),
        )
      : [];

    const passed = missing.length === 0 && forbidden.length === 0;
    const severity = forbidden.length > 0 ? 'high' : passed ? 'info' : 'medium';

    return {
      runId: ctx.runId,
      evaluatorId: this.id,
      passed,
      severity,
      message: passed
        ? `Auditoría completa (${mustInclude.length} patrón(es) presentes${mustNotInclude.length > 0 ? ', sin eventos prohibidos para la acción' : ''})`
        : forbidden.length > 0
          ? `Hallazgo: auditoría registra evento prohibido para la acción bloqueada (${forbidden.join(', ')})`
          : `Auditoría incompleta — faltan eventos: ${missing.join(', ')}`,
      details: {
        eventCount: events.length,
        missing,
        forbidden,
        ...(actionEntityId !== undefined ? { actionEntityId } : {}),
      },
    };
  }
}
