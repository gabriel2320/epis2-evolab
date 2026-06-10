import type { DeterministicEvaluator, EvaluatorContext } from './types.js';
import type { EvaluationResult } from '../contracts/schemas.js';

/** Coherencia del censo de servicio: ocupadas con paciente/admisión, disponibles sin paciente. */
export class CensusIntegrityEvaluator implements DeterministicEvaluator {
  id = 'census_integrity';

  evaluate(ctx: EvaluatorContext): EvaluationResult {
    const obs = ctx.observations.find((o) => o.kind === 'census_snapshot');
    if (!obs) {
      return {
        runId: ctx.runId,
        evaluatorId: this.id,
        passed: false,
        severity: 'medium',
        message: 'Sin observación census_snapshot',
      };
    }

    const status = typeof obs.payload.status === 'number' ? obs.payload.status : 0;
    const bedCount = typeof obs.payload.bedCount === 'number' ? obs.payload.bedCount : 0;
    const occupiedWithoutPatient = Number(obs.payload.occupiedWithoutPatient ?? 0);
    const occupiedWithoutAdmission = Number(obs.payload.occupiedWithoutAdmission ?? 0);
    const availableWithPatient = Number(obs.payload.availableWithPatient ?? 0);
    const demoPatientListed = obs.payload.demoPatientListed === true;

    const expectCoherent = ctx.expected.censusCoherent === true;
    const expectDemoListed = ctx.expected.demoPatientListed === true;

    const coherent =
      status === 200 &&
      bedCount > 0 &&
      occupiedWithoutPatient === 0 &&
      occupiedWithoutAdmission === 0 &&
      availableWithPatient === 0;

    const passed = (!expectCoherent || coherent) && (!expectDemoListed || demoPatientListed);

    return {
      runId: ctx.runId,
      evaluatorId: this.id,
      passed,
      severity: passed ? 'info' : 'high',
      message: passed
        ? `Censo coherente (${bedCount} camas, demo listado=${demoPatientListed})`
        : 'Censo incoherente — camas ocupadas sin paciente/admisión o disponibles con paciente',
      details: {
        status,
        bedCount,
        occupiedWithoutPatient,
        occupiedWithoutAdmission,
        availableWithPatient,
        demoPatientListed,
      },
    };
  }
}
