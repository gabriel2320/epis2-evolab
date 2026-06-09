import { spawnSync } from 'node:child_process';
import { createLogger } from '../logger.js';

const log = createLogger('sandbox-prep');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SandboxPrepResult = {
  ok: boolean;
  message: string;
  skipped?: boolean;
};

/** Restaura acknowledged_at=NULL para un resultado crítico demo (idempotente). */
export function resetCriticalPendingAcknowledgement(
  criticalResultId: string,
): SandboxPrepResult {
  if (!UUID_RE.test(criticalResultId)) {
    return { ok: false, message: `criticalResultId inválido: ${criticalResultId}` };
  }

  const sql = `UPDATE clinical_critical_results SET acknowledged_at = NULL, acknowledged_by = NULL WHERE id = '${criticalResultId}';`;
  const result = spawnSync(
    'docker',
    ['exec', 'epis2-postgres', 'psql', '-U', 'epis2', '-d', 'epis2', '-c', sql],
    { encoding: 'utf8' },
  );

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    log.warn('Reset crítico pendiente omitido', { criticalResultId, detail });
    return {
      ok: false,
      skipped: true,
      message: `No se pudo resetear crítico (¿docker/postgres?): ${detail || 'error desconocido'}`,
    };
  }

  log.info('Crítico demo restaurado a pendiente', { criticalResultId });
  return { ok: true, message: `Crítico ${criticalResultId} sin acuse` };
}

export function prepareScenarioFixture(fixture: Record<string, unknown> | undefined): SandboxPrepResult {
  if (fixture?.criticalResultPendingAcknowledgement === true) {
    const criticalResultId = fixture.criticalResultId;
    if (typeof criticalResultId !== 'string' || !criticalResultId) {
      return { ok: false, message: 'fixture.criticalResultId requerido para crítico pendiente' };
    }
    return resetCriticalPendingAcknowledgement(criticalResultId);
  }

  if (fixture?.medicationStatus === 'suspended' || fixture?.marDoseHeld === true) {
    const marDoseId = fixture.marDoseId;
    if (typeof marDoseId !== 'string' || !marDoseId) {
      return { ok: false, message: 'fixture.marDoseId requerido para dosis MAR held' };
    }
    return holdMarScheduledDose(marDoseId);
  }

  return { ok: true, message: 'Sin preparación de fixture requerida', skipped: true };
}

/** Marca dosis MAR demo como held (suspendida). */
export function holdMarScheduledDose(marDoseId: string): SandboxPrepResult {
  if (!UUID_RE.test(marDoseId)) {
    return { ok: false, message: `marDoseId inválido: ${marDoseId}` };
  }

  const sql = `UPDATE mar_scheduled_doses SET status = 'held' WHERE id = '${marDoseId}';`;
  const result = spawnSync(
    'docker',
    ['exec', 'epis2-postgres', 'psql', '-U', 'epis2', '-d', 'epis2', '-c', sql],
    { encoding: 'utf8' },
  );

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    log.warn('Hold MAR omitido', { marDoseId, detail });
    return {
      ok: false,
      skipped: true,
      message: `No se pudo marcar dosis held: ${detail || 'error desconocido'}`,
    };
  }

  log.info('Dosis MAR demo marcada held', { marDoseId });
  return { ok: true, message: `Dosis ${marDoseId} en estado held` };
}
