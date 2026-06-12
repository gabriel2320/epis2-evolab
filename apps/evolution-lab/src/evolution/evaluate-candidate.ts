import type { ScenarioDefinition } from '../contracts/schemas.js';
import type { EvolabConfig } from '../config/env.js';
import { extractRunCoverage, extractScenarioStaticCoverage } from '../fitness/coverage-extract.js';
import {
  computeScenarioNovelty,
  createFileEmbeddingCache,
  createOllamaEmbeddingsClient,
  type EmbeddingCache,
  type EmbeddingsClient,
} from '../fitness/novelty.js';
import type { EvolutionOrchestrator } from '../orchestrator/orchestrator.js';
import type { ScenarioObservation } from '../evaluators/types.js';
import { loadScenarioFromFile } from '../scenarios/loader.js';
import { minimalFitness, scoreFitness, type CandidateFitness } from './archive.js';

export type BaselineCoverage = {
  endpoints: Set<string>;
  auditEvents: Set<string>;
};

export type EvaluateCandidateInput = {
  scenario: ScenarioDefinition;
  candidatePath?: string;
  baseline: BaselineCoverage;
  timeoutMs: number;
  resetFixtures?: boolean;
  corpusForNovelty: ScenarioDefinition[];
  embeddings?: EmbeddingsClient | null;
  embeddingCache?: EmbeddingCache;
};

export type EvaluateCandidateResult = {
  ok: boolean;
  fitness: CandidateFitness;
  runId?: string;
  durationMs: number;
  failureReason?: string;
};

/** Escenarios cuyo fixture requiere reset obligatorio antes de ejecutar. */
export function scenarioNeedsFixtureReset(scenario: ScenarioDefinition): boolean {
  const fixture = scenario.fixture as Record<string, unknown> | undefined;
  if (!fixture) return false;
  return (
    fixture.criticalResultPendingAcknowledgement === true ||
    fixture.medicationStatus === 'suspended' ||
    fixture.marDoseHeld === true
  );
}

function runDurationMs(startedAt: string, completedAt: string | undefined): number {
  if (!completedAt) return 0;
  const delta = Date.parse(completedAt) - Date.parse(startedAt);
  return Number.isFinite(delta) && delta >= 0 ? delta : 0;
}

function computeFitnessFromRun(input: {
  scenario: ScenarioDefinition;
  observations: ScenarioObservation[];
  findingsCount: number;
  highFindingsCount: number;
  durationMs: number;
  baseline: BaselineCoverage;
  novelty: number | null;
  executionOk: boolean;
  failureReason?: string;
}): CandidateFitness {
  if (!input.executionOk) {
    return minimalFitness(input.failureReason ?? 'ejecucion_fallida');
  }

  const coverage = extractRunCoverage(input.scenario, input.observations);
  const newEndpoints = coverage.endpoints.filter((e) => !input.baseline.endpoints.has(e)).length;
  const newAuditEvents = coverage.auditEvents.filter(
    (e) => !input.baseline.auditEvents.has(e),
  ).length;

  const fitness: CandidateFitness = {
    endpointsCovered: coverage.endpoints,
    auditEventsCovered: coverage.auditEvents,
    newEndpoints,
    newAuditEvents,
    findingsCount: input.findingsCount,
    highFindingsCount: input.highFindingsCount,
    durationMs: input.durationMs,
    novelty: input.novelty,
    score: 0,
    executionOk: true,
  };
  fitness.score = scoreFitness(fitness);
  return fitness;
}

/**
 * S9.3 — Ejecuta un candidato vía orquestador, calcula fitness real post-run
 * (cobertura nueva, hallazgos, novedad, duración). Fallo ⇒ fitness mínimo +
 * discarded; nunca propaga excepciones al loop evolutivo.
 */
export async function evaluateCandidate(
  orchestrator: EvolutionOrchestrator,
  input: EvaluateCandidateInput,
): Promise<EvaluateCandidateResult> {
  const started = Date.now();

  try {
    const resetFixtures = input.resetFixtures === true || scenarioNeedsFixtureReset(input.scenario);

    const result = await orchestrator.executeScenarioDefinition(input.scenario, undefined, {
      ...(resetFixtures ? { resetFixtures: true } : {}),
    });

    const durationMs = runDurationMs(
      result.run.startedAt ?? new Date().toISOString(),
      result.run.completedAt,
    );
    const observations = result.observations ?? [];
    const executionOk = result.finalStatus !== 'failed';
    const failureReason = result.finalStatus === 'failed' ? result.message : undefined;

    let novelty: number | null = null;
    if (input.embeddings) {
      novelty = await computeScenarioNovelty(
        input.scenario,
        input.corpusForNovelty,
        input.embeddings,
        input.embeddingCache ?? createFileEmbeddingCache(),
      );
    }

    const fitness = computeFitnessFromRun({
      scenario: input.scenario,
      observations,
      findingsCount: result.findingsCount ?? 0,
      highFindingsCount: result.findingsHighCount ?? 0,
      durationMs,
      baseline: input.baseline,
      novelty,
      executionOk,
      ...(failureReason ? { failureReason } : {}),
    });

    return {
      ok: executionOk && fitness.score >= 0,
      fitness,
      runId: result.run.id,
      durationMs: Date.now() - started,
      ...(failureReason ? { failureReason } : {}),
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      fitness: minimalFitness(reason.slice(0, 500)),
      durationMs: Date.now() - started,
      failureReason: reason,
    };
  }
}

/** Carga candidato desde ruta YAML y lo evalúa. */
export async function evaluateCandidateFile(
  orchestrator: EvolutionOrchestrator,
  candidatePath: string,
  rest: Omit<EvaluateCandidateInput, 'scenario' | 'candidatePath'>,
): Promise<EvaluateCandidateResult & { scenario: ScenarioDefinition }> {
  const scenario = loadScenarioFromFile(candidatePath);
  const result = await evaluateCandidate(orchestrator, {
    ...rest,
    scenario,
    candidatePath,
  });
  return { ...result, scenario };
}

/** Cobertura estática acumulada del corpus humano + élites (baseline S9). */
export function buildBaselineCoverage(
  corpus: ScenarioDefinition[],
  eliteScenarios: ScenarioDefinition[] = [],
): BaselineCoverage {
  const endpoints = new Set<string>();
  const auditEvents = new Set<string>();

  for (const s of [...corpus, ...eliteScenarios]) {
    const cov = extractScenarioStaticCoverage(s);
    for (const e of cov.endpoints) endpoints.add(e);
    for (const a of cov.auditEvents) auditEvents.add(a);
  }
  return { endpoints, auditEvents };
}

export function createEvaluateDeps(config: EvolabConfig): {
  embeddings: EmbeddingsClient;
  embeddingCache: ReturnType<typeof createFileEmbeddingCache>;
} {
  return {
    embeddings: createOllamaEmbeddingsClient({
      baseUrl: config.ollamaUrl,
      ...(config.embeddingModel ? { model: config.embeddingModel } : {}),
    }),
    embeddingCache: createFileEmbeddingCache(),
  };
}
