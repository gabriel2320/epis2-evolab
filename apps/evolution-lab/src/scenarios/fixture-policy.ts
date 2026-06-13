import type { ScenarioDefinition } from '../contracts/schemas.js';

/**
 * F3 — reset automático de fixtures sandbox antes de evaluate/replay
 * cuando el escenario depende de críticos pendientes o guards clínicos.
 */
export function scenarioNeedsFixtureReset(scenario: ScenarioDefinition): boolean {
  const fixture = scenario.fixture as Record<string, unknown> | undefined;
  if (!fixture) {
    return scenarioHasCriticalDischargeEvaluators(scenario);
  }

  if (fixture.criticalResultPendingAcknowledgement === true) return true;
  if (fixture.medicationStatus === 'suspended') return true;
  if (fixture.marDoseHeld === true) return true;

  if (typeof fixture.criticalResultId === 'string' && fixture.criticalResultId.length > 0) {
    return true;
  }

  return scenarioHasCriticalDischargeEvaluators(scenario);
}

function scenarioHasCriticalDischargeEvaluators(scenario: ScenarioDefinition): boolean {
  const evaluators = scenario.evaluators ?? [];
  if (evaluators.includes('critical_pending')) return true;
  if (
    evaluators.includes('clinical_safety') &&
    scenario.expected?.dischargeBlocked === true
  ) {
    return true;
  }
  return false;
}

export function resolveResetFixtures(
  scenario: ScenarioDefinition,
  explicit?: boolean,
): boolean {
  return explicit === true || scenarioNeedsFixtureReset(scenario);
}
