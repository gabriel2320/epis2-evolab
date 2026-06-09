import type { EvaluationResult } from '../contracts/schemas.js';

export type ScenarioObservation = {
  kind: string;
  label: string;
  payload: Record<string, unknown>;
};

export type EvaluatorContext = {
  runId: string;
  scenarioId: string;
  expected: Record<string, unknown>;
  observations: ScenarioObservation[];
};

export interface DeterministicEvaluator {
  id: string;
  evaluate(ctx: EvaluatorContext): EvaluationResult;
}

export function runDeterministicEvaluators(
  evaluators: DeterministicEvaluator[],
  ctx: EvaluatorContext,
): EvaluationResult[] {
  return evaluators.map((e) => e.evaluate(ctx));
}

export function allPassed(evaluations: EvaluationResult[]): boolean {
  return evaluations.every((e) => e.passed);
}
