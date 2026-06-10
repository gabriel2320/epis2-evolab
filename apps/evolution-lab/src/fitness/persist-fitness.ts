import type { EvolutionRun, ScenarioDefinition } from '../contracts/schemas.js';
import type { ScenarioObservation } from '../evaluators/types.js';
import { createLogger } from '../logger.js';
import { listScenarios } from '../scenarios/loader.js';
import { insertScenarioFitness } from '../persistence/fitness-repository.js';
import { extractRunCoverage } from './coverage-extract.js';
import {
  computeScenarioNovelty,
  createFileEmbeddingCache,
  createOllamaEmbeddingsClient,
} from './novelty.js';

const log = createLogger('persist-fitness');

export type PersistFitnessInput = {
  run: EvolutionRun;
  scenario: ScenarioDefinition;
  observations: ScenarioObservation[];
  findingsCount: number;
  ollamaUrl?: string;
  embeddingModel?: string;
};

function runDurationMs(run: EvolutionRun): number {
  if (!run.startedAt || !run.completedAt) return 0;
  const delta = Date.parse(run.completedAt) - Date.parse(run.startedAt);
  return Number.isFinite(delta) && delta >= 0 ? delta : 0;
}

/**
 * Fase PERSIST (fitness, S7.3): escribe la fila scenario_fitness del run.
 * Best-effort: la novedad degrada a null si Ollama no responde y cualquier
 * error de DB se registra como warning sin afectar el run.
 */
export async function persistScenarioFitness(
  databaseUrl: string | undefined,
  input: PersistFitnessInput,
): Promise<void> {
  if (!databaseUrl) return;
  try {
    const coverage = extractRunCoverage(input.scenario, input.observations);

    let novelty: number | null = null;
    if (input.ollamaUrl) {
      const client = createOllamaEmbeddingsClient({
        baseUrl: input.ollamaUrl,
        ...(input.embeddingModel ? { model: input.embeddingModel } : {}),
      });
      novelty = await computeScenarioNovelty(
        input.scenario,
        listScenarios(),
        client,
        createFileEmbeddingCache(),
      );
    }

    await insertScenarioFitness(databaseUrl, {
      scenarioId: input.scenario.id,
      runId: input.run.id,
      endpointsCovered: coverage.endpoints,
      auditEventsCovered: coverage.auditEvents,
      findingsCount: input.findingsCount,
      durationMs: runDurationMs(input.run),
      novelty,
    });
    log.info('Fitness persistido', {
      runId: input.run.id,
      scenarioId: input.scenario.id,
      endpoints: coverage.endpoints.length,
      auditEvents: coverage.auditEvents.length,
      novelty: novelty ?? 'null',
    });
  } catch (err) {
    log.warn('Persistencia de fitness omitida', {
      runId: input.run.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
