import { randomUUID } from 'node:crypto';
import { loadEvolabConfig } from '../config/env.js';
import { EvolutionOrchestrator } from '../orchestrator/orchestrator.js';
import { getRunSeedFromDb } from '../persistence/repository.js';
import { loadRunMetadata, type ReplayMetadata } from './replay.js';

export type RegenerateStrategy = 'exact' | 'new-seed';

export type ResolvedRunContext = ReplayMetadata & {
  source: 'filesystem' | 'database';
};

export async function resolveRunContext(runId: string): Promise<ResolvedRunContext> {
  const config = loadEvolabConfig();
  try {
    const meta = loadRunMetadata(runId, config.reportsDir);
    return { ...meta, runId: meta.runId ?? runId, source: 'filesystem' };
  } catch {
    if (!config.databaseUrl) {
      throw new Error(`Run ${runId} no encontrado en filesystem ni DB configurada`);
    }
    const fromDb = await getRunSeedFromDb(config.databaseUrl, runId);
    if (!fromDb) {
      throw new Error(`Run ${runId} no encontrado`);
    }
    return {
      runId,
      scenarioId: fromDb.scenarioId,
      randomSeed: fromDb.randomSeed,
      targetEnvironmentId: fromDb.targetEnvironmentId,
      source: 'database',
    };
  }
}

export function resolveSeedForStrategy(
  strategy: RegenerateStrategy,
  originalSeed: string,
): string {
  if (strategy === 'exact') return originalSeed;
  return randomUUID();
}

export async function regenerateRun(
  runId: string,
  strategy: RegenerateStrategy = 'exact',
): Promise<ReturnType<EvolutionOrchestrator['executeRun']>> {
  const ctx = await resolveRunContext(runId);
  const seed = resolveSeedForStrategy(strategy, ctx.randomSeed);
  const orchestrator = new EvolutionOrchestrator(loadEvolabConfig());
  const result = await orchestrator.executeRun(ctx.scenarioId, seed);
  return result;
}

export async function replayRunFromAnySource(
  runId: string,
): Promise<ReturnType<EvolutionOrchestrator['executeRun']>> {
  return regenerateRun(runId, 'exact');
}
