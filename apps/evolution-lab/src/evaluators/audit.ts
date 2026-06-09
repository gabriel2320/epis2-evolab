import type { DeterministicEvaluator, EvaluatorContext } from './types.js';
import type { EvaluationResult } from '../contracts/schemas.js';

type AuditEvent = {
  eventType?: string;
  entityType?: string;
  entityId?: string;
};

function auditEvents(ctx: EvaluatorContext): AuditEvent[] {
  const obs = ctx.observations.find((o) => o.kind === 'audit_trail');
  const events = obs?.payload.events;
  return Array.isArray(events) ? (events as AuditEvent[]) : [];
}

export class AuditEvaluator implements DeterministicEvaluator {
  id = 'audit';

  evaluate(ctx: EvaluatorContext): EvaluationResult {
    const expected = ctx.expected.auditEventCreated === true;
    const events = auditEvents(ctx);

    const draftApproved = events.some((e) => e.eventType?.includes('draft.approved'));
    const draftCreated = events.some((e) => e.eventType?.includes('draft'));
    const authEvents = events.some((e) => e.eventType?.startsWith('auth.'));
    const hasRelevant = draftApproved || draftCreated || authEvents;

    const passed = expected ? hasRelevant : true;

    return {
      runId: ctx.runId,
      evaluatorId: this.id,
      passed,
      severity: passed ? 'info' : 'medium',
      message: passed
        ? `Auditoría capturada (${events.length} eventos recientes)`
        : 'No se encontraron eventos de auditoría relevantes tras la acción',
      details: { eventCount: events.length, draftApproved, draftCreated },
    };
  }
}
