import type { DeterministicEvaluator, EvaluatorContext } from './types.js';
import type { EvaluationResult } from '../contracts/schemas.js';

type CdrAlert = { ruleId?: string; severity?: string; source?: string };

/**
 * Cruza dos fuentes que en EPIS2 son independientes:
 * - DB clínica (`clinical_critical_results`) vía observación sandbox_critical
 * - Motor CDR/CDS vía observación clinical_alerts_api (/api/patients/:id/clinical-alerts)
 * Si la DB tiene críticos sin acuse pero el CDR no emite alerta crítica, hay un gap accionable.
 */
export class CdrConsistencyEvaluator implements DeterministicEvaluator {
  id = 'cdr_consistency';

  evaluate(ctx: EvaluatorContext): EvaluationResult {
    if (ctx.expected.cdrConsistent !== true) {
      return {
        runId: ctx.runId,
        evaluatorId: this.id,
        passed: true,
        severity: 'info',
        message: 'cdrConsistent no requerido por el escenario',
      };
    }

    const sandbox = ctx.observations.find(
      (o) => o.kind === 'sandbox_critical' && o.label === 'unacknowledged_criticals',
    );
    const alertsObs = ctx.observations.find((o) => o.kind === 'clinical_alerts_api');

    if (!sandbox || !alertsObs) {
      return {
        runId: ctx.runId,
        evaluatorId: this.id,
        passed: false,
        severity: 'medium',
        message: 'Faltan observaciones para cruzar CDR vs clinical_critical_results',
        details: { hasSandbox: Boolean(sandbox), hasAlerts: Boolean(alertsObs) },
      };
    }

    const alertsStatus =
      typeof alertsObs.payload.status === 'number' ? alertsObs.payload.status : 0;
    if (alertsStatus !== 200) {
      return {
        runId: ctx.runId,
        evaluatorId: this.id,
        passed: false,
        severity: 'medium',
        message: `clinical-alerts no disponible (HTTP ${alertsStatus}) — cruce CDR imposible`,
        details: { alertsStatus },
      };
    }

    const dbPending =
      sandbox.payload.hasUnacknowledgedCritical === true ||
      (typeof sandbox.payload.count === 'number' && sandbox.payload.count > 0);
    const criticalIds = Array.isArray(sandbox.payload.criticalIds)
      ? (sandbox.payload.criticalIds as string[])
      : [];

    const alerts = Array.isArray(alertsObs.payload.alerts)
      ? (alertsObs.payload.alerts as CdrAlert[])
      : [];
    const cdrCriticalAlerts = alerts.filter(
      (a) => a.severity === 'critical' || a.ruleId?.includes('critical_lab'),
    );
    const cdrReflectsCritical = cdrCriticalAlerts.length > 0;

    const details = {
      dbPending,
      criticalIds,
      alertCount: alerts.length,
      cdrCriticalRuleIds: cdrCriticalAlerts.map((a) => a.ruleId),
    };

    if (dbPending && !cdrReflectsCritical) {
      return {
        runId: ctx.runId,
        evaluatorId: this.id,
        passed: false,
        severity: 'high',
        message:
          'Hallazgo: clinical_critical_results tiene críticos sin acuse pero el CDR no emite alerta crítica en clinical-alerts — fuentes desincronizadas',
        details,
      };
    }

    if (!dbPending && cdrReflectsCritical) {
      return {
        runId: ctx.runId,
        evaluatorId: this.id,
        passed: false,
        severity: 'medium',
        message:
          'CDR emite alerta crítica sin respaldo en clinical_critical_results (posible falso positivo)',
        details,
      };
    }

    return {
      runId: ctx.runId,
      evaluatorId: this.id,
      passed: true,
      severity: 'info',
      message: dbPending
        ? `CDR coherente: crítico pendiente reflejado en clinical-alerts (${cdrCriticalAlerts.length} alerta(s) crítica(s))`
        : 'CDR coherente: sin críticos pendientes ni alertas críticas',
      details,
    };
  }
}
