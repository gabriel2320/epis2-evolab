import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadEvolabConfig } from '../config/env.js';
import { EvolutionOrchestrator } from '../orchestrator/orchestrator.js';
import { listScenarios, scenariosDirectory } from '../scenarios/loader.js';

/** Escenarios base (no mutantes) que deben pasar antes de evolve (S16.3). */
export const PRE_EVOLVE_BASE_SCENARIO_IDS = [
  'admission-discharge-001',
  'discharge-critical-pending-001',
  'admission-double-booking-001',
  'census-service-integrity-001',
] as const;

export type PreEvolveSmokeResult = {
  ok: boolean;
  messages: string[];
  passed: number;
  failed: number;
  review: number;
  scenarioResults: Array<{ scenarioId: string; status: string; findings: number }>;
};

function resolveBaseScenarioIds(): string[] {
  const known = new Set(listScenarios().map((s) => s.id));
  const ids = PRE_EVOLVE_BASE_SCENARIO_IDS.filter((id) => known.has(id));
  if (ids.length > 0) return [...ids];

  return listScenarios()
    .filter((s) => s.tags?.includes('smoke') && !/-m[a-z0-9]+-\d+$/i.test(s.id))
    .map((s) => s.id);
}

function scenarioFileExists(scenarioId: string): boolean {
  const dir = scenariosDirectory();
  return (
    existsSync(join(dir, `${scenarioId}.yaml`)) || existsSync(join(dir, `${scenarioId}.yml`))
  );
}

/**
 * Gate pre-evolve: smoke de escenarios base en EPIS2 (sin mutantes).
 * Falla si algún escenario no alcanza `completed` (human_review cuenta como no verde).
 */
export async function runPreEvolveBaseSmokeGate(opts?: {
  resetFixtures?: boolean;
}): Promise<PreEvolveSmokeResult> {
  const config = loadEvolabConfig();
  const orchestrator = new EvolutionOrchestrator(config);
  const scenarioIds = resolveBaseScenarioIds().filter(scenarioFileExists);

  const messages: string[] = [];
  if (scenarioIds.length === 0) {
    return {
      ok: false,
      messages: ['Sin escenarios base para smoke pre-evolve'],
      passed: 0,
      failed: 0,
      review: 0,
      scenarioResults: [],
    };
  }

  messages.push(`Smoke pre-evolve: ${scenarioIds.length} escenarios base`);

  let passed = 0;
  let failed = 0;
  let review = 0;
  const scenarioResults: PreEvolveSmokeResult['scenarioResults'] = [];

  for (const scenarioId of scenarioIds) {
    try {
      const result = await orchestrator.executeRun(scenarioId, undefined, {
        ...(opts?.resetFixtures ? { resetFixtures: true } : {}),
      });
      const status = result.finalStatus ?? 'failed';
      const findings = result.findingsCount ?? 0;
      scenarioResults.push({ scenarioId, status, findings });

      if (status === 'completed') {
        passed += 1;
        messages.push(`  ✓ ${scenarioId} — completed`);
      } else if (status === 'human_review') {
        review += 1;
        messages.push(`  ◐ ${scenarioId} — human_review (${findings} hallazgos)`);
      } else {
        failed += 1;
        messages.push(`  ✗ ${scenarioId} — ${status}`);
      }
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      scenarioResults.push({ scenarioId, status: 'error', findings: 0 });
      messages.push(`  ✗ ${scenarioId} — error: ${msg}`);
    }
  }

  const ok = failed === 0 && review === 0 && passed === scenarioIds.length;
  if (!ok) {
    messages.push(
      '\nGate pre-evolve FAILED — corregir sandbox EPIS2 o escenarios base antes de evolve.',
    );
  } else {
    messages.push('\nGate pre-evolve OK — escenarios base verdes.');
  }

  return { ok, messages, passed, failed, review, scenarioResults };
}
