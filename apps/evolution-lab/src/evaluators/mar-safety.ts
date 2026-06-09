import type { DeterministicEvaluator, EvaluatorContext } from './types.js';
import type { EvaluationResult } from '../contracts/schemas.js';

function obs(ctx: EvaluatorContext, kind: string, label?: string) {
  return ctx.observations.find((o) => o.kind === kind && (label ? o.label === label : true));
}

export class MarSafetyEvaluator implements DeterministicEvaluator {
  id = 'mar_safety';

  evaluate(ctx: EvaluatorContext): EvaluationResult {
    const expectedBlocked = ctx.expected.administrationBlocked === true;
    const nursing = obs(ctx, 'nursing_dashboard', 'scheduled_mar');
    const alertsApi = obs(ctx, 'clinical_alerts_api', 'mar_alerts');
    const approve = obs(ctx, 'api_response', 'mar_approve_attempt');
    const marPrep = obs(ctx, 'fixture_prep', 'mar_dose_held');

    const doseHeld =
      marPrep?.payload.held === true ||
      nursing?.payload.targetDoseHeld === true ||
      nursing?.payload.targetDoseStatus === 'held';

    const apiAlerts = Array.isArray(alertsApi?.payload.alerts)
      ? (alertsApi.payload.alerts as Array<{ ruleId?: string; severity?: string }>)
      : [];
    const hasMarWarning = apiAlerts.some(
      (a) =>
        a.ruleId?.includes('allergy') ||
        a.ruleId?.includes('double_check') ||
        a.ruleId?.includes('high_risk'),
    );

    const approveStatus =
      typeof approve?.payload.status === 'number' ? approve.payload.status : 0;
    const approveSucceeded = approve?.payload.ok === true;
    const administrationBlocked =
      approveStatus === 403 || approveStatus === 400 || approveStatus === 422;

    if (doseHeld && approveSucceeded && expectedBlocked) {
      return {
        runId: ctx.runId,
        evaluatorId: this.id,
        passed: false,
        severity: 'critical',
        message:
          'Hallazgo: MAR aprobado para dosis held/suspendida — regla clínica no aplicada en API',
        details: { approveStatus, doseHeld, hasMarWarning },
      };
    }

    const warningVisible = hasMarWarning || doseHeld;
    const passed =
      (!ctx.expected.warningVisible || warningVisible || doseHeld) &&
      (!expectedBlocked || administrationBlocked || !approve);

    return {
      runId: ctx.runId,
      evaluatorId: this.id,
      passed,
      severity: passed ? 'info' : 'high',
      message: passed
        ? 'Seguridad MAR coherente con dosis held observada'
        : 'Seguridad MAR insuficiente — falta bloqueo o advertencia',
      details: { doseHeld, warningVisible, administrationBlocked, approveStatus },
    };
  }
}
