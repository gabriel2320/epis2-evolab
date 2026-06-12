import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { EvolabConfig } from '../config/env.js';
import { ScenarioDefinitionSchema, type ScenarioDefinition } from '../contracts/schemas.js';
import { createLogger } from '../logger.js';
import { runMutationPipeline, type MutationPipelineResult } from '../mutation/pipeline.js';
import { createOllamaScenarioMutationClient } from '../mutation/ollama-mutator.js';
import { createOperators } from '../mutation/operators.js';
import { recordMutationBanditRewards, resolveMutationEnsemble } from '../mutation/ensemble.js';
import { createFileEmbeddingCache, createOllamaEmbeddingsClient } from '../fitness/novelty.js';
import { EvolutionOrchestrator } from '../orchestrator/orchestrator.js';
import { loadScenarioFromFile, listScenarios, scenariosDirectory } from '../scenarios/loader.js';
import {
  createInMemoryArchiveStore,
  decideElite,
  minimalFitness,
  type ArchiveEntry,
  type ArchiveStore,
} from './archive.js';
import { createPostgresArchiveStore } from './archive-repository.js';
import { buildBaselineCoverage, evaluateCandidate } from './evaluate-candidate.js';
import { assignNiche, emptyNiches, nicheKey } from './niches.js';
import { selectParents } from './select-parents.js';
import { buildF5Progress, readF5RunState, writeF5Progress } from './f5-progress.js';

const log = createLogger('evolve');

export const DEFAULT_POPULATION = 3;
export const DEFAULT_CANDIDATE_TIMEOUT_MS = 180_000;

export type EvolveOptions = {
  generations: number;
  budgetMinutes: number;
  population?: number;
  dryRun?: boolean;
  candidateTimeoutMs?: number;
  mutationIndexOffset?: number;
};

export type GenerationSummary = {
  generation: number;
  mutationsAttempted: number;
  mutationsValid: number;
  evaluated: number;
  newElites: number;
  replacedElites: number;
  keptCandidates: number;
  discarded: number;
  durationMs: number;
};

export type EvolveResult = {
  generationsCompleted: number;
  budgetMinutes: number;
  budgetExceeded: boolean;
  summaries: GenerationSummary[];
  archive: {
    elites: ArchiveEntry[];
    emptyNiches: ReturnType<typeof emptyNiches>;
    candidatesPending: number;
    newElitesInPreviouslyEmpty: number;
  };
  totalDurationMs: number;
};

export type EvolveDeps = {
  mutate?: (input: {
    count: number;
    corpus: ScenarioDefinition[];
    mutationIndexOffset: number;
    generation: number;
    outputDir: string;
  }) => Promise<MutationPipelineResult>;
  evaluate?: typeof evaluateCandidate;
};

function eliteMap(elites: ArchiveEntry[]): Map<string, ArchiveEntry> {
  const map = new Map<string, ArchiveEntry>();
  for (const e of elites) {
    if (e.status === 'elite' || e.status === 'promoted') {
      map.set(e.nicheKey, e);
    }
  }
  return map;
}

function parseEliteYaml(yaml: string): ScenarioDefinition | undefined {
  try {
    return ScenarioDefinitionSchema.parse(parseYaml(yaml));
  } catch {
    return undefined;
  }
}

async function applyArchiveDecision(
  store: ArchiveStore,
  current: ArchiveEntry | undefined,
  candidate: ArchiveEntry,
): Promise<'new_elite' | 'replaced' | 'candidate'> {
  const decision = decideElite(current, candidate);
  if (decision.kind === 'new_elite') {
    await store.insert(decision.entry);
    return 'new_elite';
  }
  if (decision.kind === 'replaces_elite') {
    await store.updateStatus(
      decision.displaced.candidateId,
      'discarded',
      decision.displaced.discardReason,
    );
    await store.insert(decision.entry);
    return 'replaced';
  }
  await store.insert(decision.entry);
  return 'candidate';
}

/**
 * S9.4 — Loop generacional MAP-Elites: selección → mutación (S8) → evaluación
 * sandbox → archivo. Presupuesto de minutos manda; excepciones capturadas.
 */
export async function runEvolutionLoop(
  config: EvolabConfig,
  store: ArchiveStore,
  options: EvolveOptions,
  deps: EvolveDeps = {},
): Promise<EvolveResult> {
  const started = Date.now();
  const deadline = started + options.budgetMinutes * 60_000;
  const population = options.population ?? DEFAULT_POPULATION;
  const candidateTimeoutMs = options.candidateTimeoutMs ?? DEFAULT_CANDIDATE_TIMEOUT_MS;
  const mutationOffset = options.mutationIndexOffset ?? 0;

  const corpus = listScenarios().filter((s) => (s.flow ?? []).length > 0);
  const outputDir = join(scenariosDirectory(), 'candidates');
  const ensemble = await resolveMutationEnsemble(config.databaseUrl);
  const operators = createOperators(ensemble);
  const mutateClient = createOllamaScenarioMutationClient({ baseUrl: config.ollamaUrl });
  const embeddings = createOllamaEmbeddingsClient({
    baseUrl: config.ollamaUrl,
    ...(config.embeddingModel ? { model: config.embeddingModel } : {}),
  });
  const embeddingCache = createFileEmbeddingCache();
  const orchestrator = new EvolutionOrchestrator(config);
  const evaluateFn = deps.evaluate ?? evaluateCandidate;

  const emptyAtStart = new Set(
    emptyNiches(corpus, new Set((await store.listElites()).map((e) => e.nicheKey))).map(nicheKey),
  );

  const summaries: GenerationSummary[] = [];
  let generationsCompleted = 0;
  let budgetExceeded = false;
  let newElitesInPreviouslyEmpty = 0;
  let globalMutationIndex = mutationOffset;

  const defaultMutate = async (input: {
    count: number;
    corpus: ScenarioDefinition[];
    mutationIndexOffset: number;
    generation: number;
    outputDir: string;
  }): Promise<MutationPipelineResult> => {
    const runSeed = `evolve-g${input.generation}-o${input.mutationIndexOffset}`;
    return runMutationPipeline({
      count: input.count,
      operators,
      corpus: input.corpus,
      client: mutateClient,
      outputDir: input.outputDir,
      repairModel: ensemble.repair,
      embeddings,
      embeddingCache,
      runSeed,
      startIndex: input.mutationIndexOffset,
      ...(input.corpus.length === 1 ? { seedScenarioId: input.corpus[0]!.id } : {}),
    });
  };

  const mutateFn = deps.mutate ?? defaultMutate;

  const publishF5 = (generation: number, message?: string) => {
    if (process.env.EPIS2_EVOLAB_F5_WATCHDOG !== '1') return;
    const state = readF5RunState();
    const snapshot = buildF5Progress({
      runState: state,
      overrides: {
        phase: 'evolve',
        status: 'running',
        budgetMinutes: options.budgetMinutes,
        generationsTotal: options.generations,
        generationsCompleted: generation,
        currentGeneration: generation,
        elapsedMinutes: (Date.now() - started) / 60_000,
        newElitesInEmpty: newElitesInPreviouslyEmpty,
        ...(message ? { message } : {}),
      },
    });
    if (snapshot) writeF5Progress(snapshot);
  };

  for (let gen = 1; gen <= options.generations; gen += 1) {
    if (Date.now() >= deadline) {
      budgetExceeded = true;
      break;
    }

    const genStarted = Date.now();
    const genSummary: GenerationSummary = {
      generation: gen,
      mutationsAttempted: 0,
      mutationsValid: 0,
      evaluated: 0,
      newElites: 0,
      replacedElites: 0,
      keptCandidates: 0,
      discarded: 0,
      durationMs: 0,
    };

    try {
      const elites = await store.listElites();
      const eliteByNiche = eliteMap(elites);
      const eliteScenarios = elites
        .map((e) => parseEliteYaml(e.scenarioYaml))
        .filter((s): s is ScenarioDefinition => s !== undefined);

      const parents = selectParents({
        corpus,
        elites,
        seed: gen + mutationOffset,
        count: Math.min(population, Math.max(corpus.length, 1)),
      });
      const parentPool = parents.length > 0 ? parents : corpus.slice(0, population);

      if (options.dryRun) {
        genSummary.durationMs = Date.now() - genStarted;
        summaries.push(genSummary);
        generationsCompleted = gen;
        continue;
      }

      const mutationResult = await mutateFn({
        count: population,
        corpus: parentPool,
        mutationIndexOffset: globalMutationIndex,
        generation: gen,
        outputDir,
      });

      globalMutationIndex += population;
      genSummary.mutationsAttempted = mutationResult.records.length;
      genSummary.mutationsValid = mutationResult.records.filter((r) => r.validFinal).length;

      if (config.databaseUrl) {
        await recordMutationBanditRewards(config.databaseUrl, mutationResult.records, {
          generation: gen,
        });
      }

      const accepted = mutationResult.records.filter(
        (r) => r.status === 'accepted' && r.candidatePath,
      );

      const baseline = buildBaselineCoverage(corpus, eliteScenarios);
      const corpusForNovelty = [...corpus, ...eliteScenarios];

      for (const record of accepted) {
        if (Date.now() >= deadline) {
          budgetExceeded = true;
          break;
        }

        const path = record.candidatePath!;
        let scenario: ScenarioDefinition;
        try {
          scenario = loadScenarioFromFile(path);
        } catch {
          genSummary.discarded += 1;
          const raw = readFileSync(path, 'utf8');
          await store.insert({
            candidateId: randomUUID(),
            scenarioYaml: raw,
            niche: { role: 'physician', module: 'clinical', outcome: 'allowed' },
            nicheKey: 'unknown',
            fitness: minimalFitness('yaml_invalido'),
            status: 'discarded',
            discardReason: 'yaml_invalido',
            parentIds: record.parentIds,
            operator: record.operator,
            generation: gen,
          });
          continue;
        }

        genSummary.evaluated += 1;
        const remainingMs = deadline - Date.now();
        const evalResult = await evaluateFn(orchestrator, {
          scenario,
          candidatePath: path,
          baseline,
          timeoutMs: Math.max(5_000, Math.min(candidateTimeoutMs, remainingMs)),
          corpusForNovelty,
          embeddings,
          embeddingCache,
        });

        const niche = assignNiche(scenario);
        const nKey = nicheKey(niche);

        const entry: ArchiveEntry = {
          candidateId: scenario.id,
          scenarioYaml: stringifyYaml(scenario),
          niche,
          nicheKey: nKey,
          fitness: evalResult.fitness,
          status: 'candidate',
          parentIds: record.parentIds,
          operator: record.operator,
          generation: gen,
          ...(evalResult.runId ? { runId: evalResult.runId } : {}),
          createdAt: new Date().toISOString(),
        };

        if (!evalResult.ok) {
          genSummary.discarded += 1;
          await store.insert({
            ...entry,
            status: 'discarded',
            discardReason: evalResult.failureReason?.slice(0, 500) ?? 'evaluacion_fallida',
          });
          continue;
        }

        const wasEmpty = emptyAtStart.has(nKey);
        const outcome = await applyArchiveDecision(store, eliteByNiche.get(nKey), entry);

        if (outcome === 'new_elite') {
          genSummary.newElites += 1;
          if (wasEmpty) {
            newElitesInPreviouslyEmpty += 1;
            emptyAtStart.delete(nKey);
          }
          eliteByNiche.set(nKey, { ...entry, status: 'elite' });
        } else if (outcome === 'replaced') {
          genSummary.replacedElites += 1;
          eliteByNiche.set(nKey, { ...entry, status: 'elite' });
        } else {
          genSummary.keptCandidates += 1;
        }
      }
    } catch (err) {
      log.warn('Generación abortada — loop continúa', {
        generation: gen,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    genSummary.durationMs = Date.now() - genStarted;
    summaries.push(genSummary);
    generationsCompleted = gen;
    publishF5(gen, `Gen ${gen}: ${genSummary.newElites} élite(s) nueva(s)`);
    if (budgetExceeded) break;
  }

  const elites = await store.listElites();
  const occupied = new Set(elites.map((e) => e.nicheKey));
  for (const s of corpus) occupied.add(nicheKey(assignNiche(s)));
  const empty = emptyNiches(corpus, occupied);
  const candidatesPending = (await store.listByStatus('candidate')).length;

  return {
    generationsCompleted,
    budgetMinutes: options.budgetMinutes,
    budgetExceeded,
    summaries,
    archive: {
      elites,
      emptyNiches: empty,
      candidatesPending,
      newElitesInPreviouslyEmpty,
    },
    totalDurationMs: Date.now() - started,
  };
}

export function createArchiveStoreForEvolve(
  config: EvolabConfig,
  dryRun: boolean,
  memoryStore?: ArchiveStore,
): ArchiveStore {
  if (memoryStore) return memoryStore;
  if (dryRun || !config.databaseUrl) {
    return createInMemoryArchiveStore();
  }
  return createPostgresArchiveStore(config.databaseUrl);
}

export { createInMemoryArchiveStore } from './archive.js';
