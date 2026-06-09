import type { DeterministicEvaluator, EvaluatorContext } from './types.js';
import type { EvaluationResult } from '../contracts/schemas.js';

function obs(ctx: EvaluatorContext, kind: string, label?: string) {
  return ctx.observations.find((o) => o.kind === kind && (label ? o.label === label : true));
}

export class ClinicalSafetyEvaluator implements DeterministicEvaluator {
  id = 'clinical_safety';

  evaluate(ctx: EvaluatorContext): EvaluationResult {
    const expectedBlocked = ctx.expected.dischargeBlocked === true;
    const expectedWarning = ctx.expected.warningVisible === true;

    const sandbox = obs(ctx, 'sandbox_critical', 'unacknowledged_criticals');
    const alertsApi = obs(ctx, 'clinical_alerts_api', 'discharge_alerts');
    const dom = obs(ctx, 'dom_state', 'discharge_form');
    const approve = obs(ctx, 'api_response', 'discharge_approve_attempt');

    const hasUnacked =
      sandbox?.payload.hasUnacknowledgedCritical === true ||
      (typeof sandbox?.payload.count === 'number' && sandbox.payload.count > 0);

    const apiAlerts = Array.isArray(alertsApi?.payload.alerts)
      ? (alertsApi.payload.alerts as Array<{ ruleId?: string; severity?: string }>)
      : [];
    const hasCriticalLabRule = apiAlerts.some(
      (a) =>
        a.ruleId?.includes('critical_lab') ||
        a.ruleId?.includes('discharge_with_open'),
    );
    const hasBlockSeverity = apiAlerts.some(
      (a) => a.severity === 'critical' || a.severity === 'block',
    );

    const criticalAlertVisible = dom?.payload.criticalAlertVisible === true;
    const alertsPanelVisible = dom?.payload.clinicalAlertsPanelVisible === true;
    const signDisabled = dom?.payload.signDisabled === true;

    const approveStatus =
      typeof approve?.payload.status === 'number' ? approve.payload.status : 0;
    const approveSucceeded = approve?.payload.ok === true;
    const dischargeBlocked =
      signDisabled || approveStatus === 403 || approveStatus === 400 || approveStatus === 422;

    const warningVisible =
      hasCriticalLabRule ||
      hasBlockSeverity ||
      criticalAlertVisible ||
      (hasUnacked && alertsPanelVisible && apiAlerts.length > 0) ||
      (hasUnacked && apiAlerts.length > 0);

    if (!hasUnacked && expectedWarning) {
      return {
        runId: ctx.runId,
        evaluatorId: this.id,
        passed: false,
        severity: 'high',
        message: 'No se detectó resultado crítico pendiente en sandbox — verificar seeds',
        details: { hasUnacked },
      };
    }

    if (hasUnacked && approveSucceeded && expectedBlocked) {
      return {
        runId: ctx.runId,
        evaluatorId: this.id,
        passed: false,
        severity: 'critical',
        message:
          'Hallazgo: alta aprobada con resultado crítico sin acuse — regla clínica no aplicada en UI/API',
        details: { approveStatus, hasUnacked, hasCriticalLabRule, warningVisible },
      };
    }

    const passed =
      (!expectedWarning || warningVisible || hasUnacked) &&
      (!expectedBlocked || dischargeBlocked || !approve);

    return {
      runId: ctx.runId,
      evaluatorId: this.id,
      passed,
      severity: passed ? 'info' : 'high',
      message: passed
        ? 'Seguridad clínica coherente con pendiente crítico observado'
        : 'Seguridad clínica insuficiente — falta advertencia o bloqueo de alta',
      details: {
        hasUnacked,
        warningVisible,
        dischargeBlocked,
        hasCriticalLabRule,
        criticalAlertVisible,
        approveStatus,
      },
    };
  }
}

export class CriticalPendingEvaluator implements DeterministicEvaluator {
  id = 'critical_pending';

  evaluate(ctx: EvaluatorContext): EvaluationResult {
    const expectedPending = ctx.expected.criticalResultRemainsPending === true;
    const after = obs(ctx, 'sandbox_critical', 'after_discharge_attempt');
    const before = obs(ctx, 'sandbox_critical', 'unacknowledged_criticals');

    const beforeCount = typeof before?.payload.count === 'number' ? before.payload.count : 0;
    const afterCount = typeof after?.payload.count === 'number' ? after.payload.count : beforeCount;
    const stillPending = afterCount > 0;

    const passed = expectedPending ? stillPending : true;

    return {
      runId: ctx.runId,
      evaluatorId: this.id,
      passed,
      severity: passed ? 'info' : 'medium',
      message: passed
        ? 'Resultado crítico permanece pendiente de acuse'
        : 'Resultado crítico ya no pendiente tras intento de alta',
      details: { beforeCount, afterCount, stillPending },
    };
  }
}
