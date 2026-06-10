import { randomUUID } from 'node:crypto';
import type { EvolabConfig } from '../config/env.js';
import type { EvolutionRun, RunStatus, ScenarioDefinition } from '../contracts/schemas.js';
import { assertGuardsPass, runSecurityGuards } from '../security/guards.js';
import { resolveTargetEnvironment } from '../security/target-allowlist.js';
import { transition } from '../state-machine/transitions.js';
import { loadScenario } from '../scenarios/loader.js';

export type BuiltRun = {
  run: EvolutionRun;
  guardReport: ReturnType<typeof runSecurityGuards>;
  scenario: ScenarioDefinition;
};

/** Fases PREPARE+SEED: guards, target allowlist y EvolutionRun inicial. */
export function buildRun(config: EvolabConfig, scenarioId: string, seed?: string): BuiltRun {
  const guardReport = runSecurityGuards(config);
  if (!guardReport.ok) {
    throw new Error(`Guards fallaron: ${guardReport.blockedReason}`);
  }
  assertGuardsPass(config);

  const scenario = loadScenario(scenarioId);
  const target = resolveTargetEnvironment(config.targetId);
  if (!target) {
    throw new Error(`Target no resuelto: ${config.targetId}`);
  }

  let status: RunStatus = 'pending';
  status = transition(status, 'preparing');
  status = transition(status, 'seeding');

  const run: EvolutionRun = {
    id: randomUUID(),
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    targetEnvironmentId: target.id,
    personaId: `${scenario.persona.role}-${scenario.persona.experience ?? 'default'}`,
    status,
    randomSeed: seed ?? randomUUID(),
    modelName: config.model,
    modelProfile: 'simulated_user',
    promptVersion: 'mvp-1',
    startedAt: new Date().toISOString(),
    configuration: {
      llmConcurrency: config.llmConcurrency,
      browserConcurrency: config.browserConcurrency,
      browserEnabled: config.browserEnabled,
      llmSimMode: config.llmSimMode,
      attemptBudget: config.maxScenarioAttempts,
    },
  };

  return { run, guardReport, scenario };
}
