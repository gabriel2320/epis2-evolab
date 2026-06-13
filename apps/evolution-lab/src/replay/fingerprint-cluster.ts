import { loadEvolabConfig } from '../config/env.js';
import { listFindingsByFingerprint } from '../persistence/repository.js';
import { loadScenario, scenariosDirectory, candidatesDirectory } from '../scenarios/loader.js';
import { resolveScenarioDefinition } from '../scenarios/resolve-scenario.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { EvolutionOrchestrator } from '../orchestrator/orchestrator.js';
import { replayRunFromAnySource } from './regenerate.js';

export function baseScenarioId(scenarioId: string): string {
  let id = scenarioId;
  while (/-m[a-z0-9]+-\d+$/i.test(id)) {
    id = id.replace(/-m[a-z0-9]+-\d+$/i, '');
  }
  return id;
}

export function scenarioExists(scenarioId: string): boolean {
  const dirs = [scenariosDirectory(), candidatesDirectory()];
  for (const dir of dirs) {
    if (
      existsSync(join(dir, `${scenarioId}.yaml`)) ||
      existsSync(join(dir, `${scenarioId}.yml`))
    ) {
      return true;
    }
  }
  return false;
}

export type FingerprintClusterSummary = {
  fingerprint: string;
  totalFindings: number;
  openCount: number;
  scenarios: string[];
  baseScenarios: string[];
  anchorFindingId: string;
  anchorRunId: string;
  anchorScenarioId: string;
  severities: Record<string, number>;
};

export async function summarizeFingerprintCluster(
  fingerprint: string,
): Promise<FingerprintClusterSummary | null> {
  const config = loadEvolabConfig();
  if (!config.databaseUrl) return null;

  const findings = await listFindingsByFingerprint(config.databaseUrl, fingerprint, { limit: 500 });
  if (findings.length === 0) return null;

  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...findings].sort(
    (a, b) =>
      (severityOrder[a.severity as keyof typeof severityOrder] ?? 9) -
      (severityOrder[b.severity as keyof typeof severityOrder] ?? 9),
  );
  const anchor = sorted[0]!;

  const scenarios = [...new Set(findings.map((f) => f.scenarioId))];
  const baseScenarios = [...new Set(scenarios.map(baseScenarioId))];

  const severities: Record<string, number> = {};
  for (const f of findings) {
    severities[f.severity] = (severities[f.severity] ?? 0) + 1;
  }

  return {
    fingerprint: anchor.fingerprint,
    totalFindings: findings.length,
    openCount: findings.filter((f) => f.reviewStatus === 'open').length,
    scenarios,
    baseScenarios,
    anchorFindingId: anchor.id,
    anchorRunId: anchor.runId,
    anchorScenarioId: anchor.scenarioId,
    severities,
  };
}

export type ReplayFingerprintResult = {
  cluster: FingerprintClusterSummary;
  anchorReplayStatus: string;
  anchorScenarioSource?: 'corpus' | 'candidate' | 'archive';
  scenarioRuns: Array<{ scenarioId: string; status: string; findings: number }>;
};

export async function replayFingerprintCluster(
  fingerprint: string,
  opts: { maxScenarios?: number; resetFixtures?: boolean } = {},
): Promise<ReplayFingerprintResult> {
  const cluster = await summarizeFingerprintCluster(fingerprint);
  if (!cluster) {
    throw new Error(`Sin hallazgos para fingerprint ${fingerprint}`);
  }

  const maxScenarios = opts.maxScenarios ?? 3;
  const toRun = cluster.baseScenarios
    .filter((id) => scenarioExists(id))
    .slice(0, maxScenarios);

  const config = loadEvolabConfig();
  let anchorReplayStatus = 'skipped';
  let anchorScenarioSource: ReplayFingerprintResult['anchorScenarioSource'];

  try {
    const resolved = await resolveScenarioDefinition(
      cluster.anchorScenarioId,
      config.databaseUrl,
    );
    anchorScenarioSource = resolved.source;
    const anchorResult = await replayRunFromAnySource(cluster.anchorRunId);
    anchorReplayStatus = anchorResult.finalStatus ?? 'unknown';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    anchorReplayStatus = `failed: ${msg}`;
  }

  const orchestrator = new EvolutionOrchestrator(config);
  const scenarioRuns: ReplayFingerprintResult['scenarioRuns'] = [];

  for (const scenarioId of toRun) {
    try {
      loadScenario(scenarioId);
    } catch {
      continue;
    }
    const result = await orchestrator.executeRun(scenarioId, undefined, {
      ...(opts.resetFixtures ? { resetFixtures: true } : {}),
    });
    scenarioRuns.push({
      scenarioId,
      status: result.finalStatus ?? 'failed',
      findings: result.findingsCount ?? 0,
    });
  }

  return { cluster, anchorReplayStatus, anchorScenarioSource, scenarioRuns };
}
