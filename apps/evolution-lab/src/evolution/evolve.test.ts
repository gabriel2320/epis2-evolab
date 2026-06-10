import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { stringify as stringifyYaml } from 'yaml';
import { ScenarioDefinitionSchema, type ScenarioDefinition } from '../contracts/schemas.js';
import type { EvolutionOrchestrator } from '../orchestrator/orchestrator.js';
import { loadEvolabConfig } from '../config/env.js';
import { minimalFitness } from './archive.js';
import { evaluateCandidate, scenarioNeedsFixtureReset } from './evaluate-candidate.js';
import { createInMemoryArchiveStore, runEvolutionLoop } from './evolve.js';
import type { MutationPipelineResult } from '../mutation/pipeline.js';

function makeScenario(id: string): ScenarioDefinition {
  return ScenarioDefinitionSchema.parse({
    id,
    version: 1,
    name: id,
    risk: 'low',
    target: { capabilities: ['draft_lifecycle'] },
    persona: { role: 'physician' },
    goal: { action: 'x' },
    steps: ['login'],
    flow: [{ login: { label: 'login' } }],
    expected: {},
    evaluators: ['functional'],
  });
}

describe('evaluateCandidate', () => {
  it('fallo de ejecución → minimalFitness sin lanzar', async () => {
    const orchestrator = {
      executeScenarioDefinition: vi.fn().mockRejectedValue(new Error('API caída')),
    } as unknown as EvolutionOrchestrator;

    const result = await evaluateCandidate(orchestrator, {
      scenario: makeScenario('fail-001'),
      baseline: { endpoints: new Set(), auditEvents: new Set() },
      timeoutMs: 5000,
      corpusForNovelty: [],
      embeddings: null,
    });

    expect(result.ok).toBe(false);
    expect(result.fitness.executionOk).toBe(false);
    expect(result.fitness.score).toBe(-1);
  });

  it('run failed status → discarded fitness', async () => {
    const orchestrator = {
      executeScenarioDefinition: vi.fn().mockResolvedValue({
        run: {
          id: 'r1',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
        finalStatus: 'failed',
        message: 'guards',
        findingsCount: 0,
        observations: [],
      }),
    } as unknown as EvolutionOrchestrator;

    const result = await evaluateCandidate(orchestrator, {
      scenario: makeScenario('fail-002'),
      baseline: { endpoints: new Set(), auditEvents: new Set() },
      timeoutMs: 5000,
      corpusForNovelty: [],
    });

    expect(result.ok).toBe(false);
    expect(result.fitness).toEqual(minimalFitness('guards'));
  });
});

describe('scenarioNeedsFixtureReset', () => {
  it('detecta fixture crítico pendiente', () => {
    const s = makeScenario('crit');
    (s as { fixture?: unknown }).fixture = {
      criticalResultPendingAcknowledgement: true,
      criticalResultId: 'f0000000-0000-4000-8000-000000000001',
    };
    expect(scenarioNeedsFixtureReset(s)).toBe(true);
  });
});

describe('runEvolutionLoop', () => {
  it('dry-run no invoca mutación ni sandbox', async () => {
    const config = loadEvolabConfig();
    const store = createInMemoryArchiveStore();
    const mutate = vi.fn();

    await runEvolutionLoop(
      config,
      store,
      { generations: 3, budgetMinutes: 30, dryRun: true },
      { mutate },
    );

    expect(mutate).not.toHaveBeenCalled();
  });

  it('corta por presupuesto de minutos', async () => {
    const config = loadEvolabConfig();
    const store = createInMemoryArchiveStore();
    const mutate = vi.fn().mockImplementation(
      () =>
        new Promise<MutationPipelineResult>((resolve) => {
          setTimeout(
            () =>
              resolve({
                records: [],
                acceptedPaths: [],
                noveltyAvailable: true,
                totalDurationMs: 100,
              }),
            80,
          );
        }),
    );

    const result = await runEvolutionLoop(
      config,
      store,
      { generations: 20, budgetMinutes: 0.002 },
      { mutate, evaluate: vi.fn() },
    );

    expect(result.budgetExceeded).toBe(true);
    expect(result.generationsCompleted).toBeLessThan(20);
  });

  it('candidato fallido se descarta en archivo', async () => {
    const config = loadEvolabConfig();
    const store = createInMemoryArchiveStore();
    const scenario = makeScenario('cand-fail-001');
    const dir = mkdtempSync(join(tmpdir(), 'evolab-cand-'));
    const candPath = join(dir, 'cand-fail-001.yaml');
    writeFileSync(candPath, stringifyYaml(scenario), 'utf8');

    const mutate = vi.fn().mockResolvedValue({
      records: [
        {
          index: 0,
          operator: 'role_swap',
          model: 'test',
          parentIds: ['parent'],
          seed: 1,
          promptVersion: 't',
          attempts: 1,
          repaired: false,
          validDirect: true,
          validFinal: true,
          status: 'accepted',
          issues: [],
          candidatePath: candPath,
          durationMs: 1,
        },
      ],
      acceptedPaths: [candPath],
      noveltyAvailable: false,
      totalDurationMs: 1,
    } satisfies MutationPipelineResult);

    const evaluate = vi.fn().mockResolvedValue({
      ok: false,
      fitness: minimalFitness('sandbox_error'),
      durationMs: 100,
      failureReason: 'sandbox_error',
    });

    const result = await runEvolutionLoop(
      config,
      store,
      { generations: 1, budgetMinutes: 5, population: 1 },
      { mutate, evaluate },
    );

    expect(result.summaries[0]?.discarded).toBe(1);
    const discarded = await store.listByStatus('discarded');
    expect(discarded).toHaveLength(1);
    expect(discarded[0]?.discardReason).toContain('sandbox_error');
  });
});
