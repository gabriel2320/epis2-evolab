import type { EvaluationResult, EvolutionRun, ScenarioDefinition } from '../contracts/schemas.js';
import {
  allPassed,
  runDeterministicEvaluators,
  type ScenarioObservation,
} from '../evaluators/types.js';
import { buildEvaluatorsForScenario } from '../evaluators/deterministic.js';
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

  const evalCtx = {
    runId: run.id,
    scenarioId: scenario.id,
    expected: scenario.expected,
    observations,
    ...(scenario.actionObservation !== undefined
      ? { actionObservation: scenario.actionObservation }
      : {}),
  };

  const evaluators = buildEvaluatorsForScenario(scenario);
  const evaluations = runDeterministicEvaluators(evaluators, evalCtx);

  const findings = createFindingsFromEvaluations({
    runId: run.id,
    scenarioId: scenario.id,
    targetEnvironmentId: run.targetEnvironmentId,
    evaluations,
  });

  return { evaluations, findings, passed: allPassed(evaluations) };
}
