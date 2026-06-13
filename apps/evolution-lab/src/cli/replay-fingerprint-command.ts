import { loadEvolabConfig } from '../config/env.js';
import { pingEvolabDatabase } from '../persistence/client.js';
import { findHypothesisByFingerprint } from '../hypotheses/registry.js';
import { formatTraceabilityReport } from '../hypotheses/traceability.js';
import { replayFingerprintCluster } from '../replay/fingerprint-cluster.js';

export type ReplayFingerprintOptions = {
  fingerprint: string;
  maxScenarios?: number;
  json?: boolean;
  resetFixtures?: boolean;
};

export async function runReplayFingerprint(opts: ReplayFingerprintOptions): Promise<number> {
  const config = loadEvolabConfig();
  if (!config.databaseUrl || !(await pingEvolabDatabase(config.databaseUrl))) {
    console.error('replay-fingerprint requiere DB epis2_evolab (npm run evolab:db:migrate)');
    return 1;
  }

  console.log(`EPIS2 Evolab — replay-fingerprint ${opts.fingerprint}\n`);

  try {
    const result = await replayFingerprintCluster(opts.fingerprint, {
      ...(opts.maxScenarios !== undefined ? { maxScenarios: opts.maxScenarios } : {}),
      ...(opts.resetFixtures ? { resetFixtures: true } : {}),
    });

    const { cluster } = result;
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    console.log(`Cluster: ${cluster.totalFindings} hallazgos (${cluster.openCount} open)`);
    console.log(`Fingerprint completo: ${cluster.fingerprint}`);
    console.log(`Severidades: ${JSON.stringify(cluster.severities)}`);
    console.log(`Escenarios únicos: ${cluster.scenarios.length}`);
    console.log(`Bases deducidas: ${cluster.baseScenarios.join(', ')}`);
    console.log(`\nAncla:`);
    console.log(`  finding: ${cluster.anchorFindingId}`);
    console.log(`  run:     ${cluster.anchorRunId}`);
    console.log(`  escenario: ${cluster.anchorScenarioId}`);

    const hypothesis = findHypothesisByFingerprint(cluster.fingerprint);
    if (hypothesis) {
      console.log('\n' + formatTraceabilityReport(hypothesis));
    }

    console.log(`\nReplay ancla (seed exacto, fuente ${result.anchorScenarioSource ?? 'n/d'}): ${result.anchorReplayStatus}`);
    for (const run of result.scenarioRuns) {
      const icon =
        run.status === 'completed' ? '✓' : run.status === 'human_review' ? '◐' : '✗';
      console.log(`  ${icon} ${run.scenarioId} — ${run.status} (${run.findings} hallazgos)`);
    }

    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
