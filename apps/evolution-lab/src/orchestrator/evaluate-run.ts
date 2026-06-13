import type { EvaluationResult, EvolutionRun, ScenarioDefinition } from '../contracts/schemas.js';
import {
  allPassed,
  runDeterministicEvaluators,
  type ScenarioObservation,
} from '../evaluators/types.js';
import { buildEvaluatorsForScenario, scenarioEvaluatorInput } from '../evaluators/deterministic.js';
import { isBrowserStep } from '../step-engine/schema.js';
import { createFindingsFromEvaluations } from '../findings/creator.js';

export type RunEvaluation = {
  evaluations: EvaluationResult[];
  findings: ReturnType<typeof createFindingsFromEvaluations>;
  passed: boolean;
};

/** Fase EVALUATE del loop maestro: evaluadores deterministas + findings. */
export function evaluateRun(input: {
  run: EvolutionRun;
  scenario: ScenarioDefinition;
  observations: ScenarioObservation[];
}): RunEvaluation {
  const { run, scenario, observations } = input;

  const browserOpens = (scenario.flow ?? [])
    .filter((step) => isBrowserStep(step))
    .map((step) => step.browser.open)
    .filter((o): o is string => Boolean(o));

  const evalCtx = {
    runId: run.id,
    scenarioId: scenario.id,
    expected: scenario.expected,
    observations,
    ...(scenario.actionObservation !== undefined
      ? { actionObservation: scenario.actionObservation }
      : {}),
    ...(scenario.processNodeId ? { processNodeId: scenario.processNodeId } : {}),
    ...(scenario.commandIntent ? { commandIntent: scenario.commandIntent } : {}),
    ...(browserOpens.length > 0 ? { browserOpens } : {}),
  };

  const evaluators = buildEvaluatorsForScenario(scenarioEvaluatorInput(scenario));
  const evaluations = runDeterministicEvaluators(evaluators, evalCtx);

  const findings = createFindingsFromEvaluations({
    runId: run.id,
    scenarioId: scenario.id,
    targetEnvironmentId: run.targetEnvironmentId,
    evaluations,
  });

  return { evaluations, findings, passed: allPassed(evaluations) };
}

/**
 * Estado final del run:
 * - falla → human_review (con aprobación humana requerida) o failed
 * - pasa pero el escenario es un journey que muta SoT → human_review por diseño
 * - pasa → completed
 */
export function resolveFinalStatus(input: {
  passed: boolean;
  requireHumanApproval: boolean;
  scenarioRequiresHumanReview: boolean;
}): 'completed' | 'human_review' | 'failed' {
  if (!input.passed) {
    return input.requireHumanApproval ? 'human_review' : 'failed';
  }
  return input.scenarioRequiresHumanReview ? 'human_review' : 'completed';
}
