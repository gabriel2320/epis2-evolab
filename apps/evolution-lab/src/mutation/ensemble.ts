import { pingEvolabDatabase } from '../persistence/client.js';
import { recordBanditReward, selectBanditModel } from '../bandit/repository.js';
import { rewardFromValidRate } from '../bandit/ucb.js';
import type { CandidateRecord } from './pipeline.js';
import { DEFAULT_ENSEMBLE, type MutationEnsemble } from './operators.js';

/** Resuelve ensemble de mutación vía bandit UCB (S11) con fallback S8. */
export async function resolveMutationEnsemble(databaseUrl?: string): Promise<MutationEnsemble> {
  if (!databaseUrl || !(await pingEvolabDatabase(databaseUrl))) {
    return DEFAULT_ENSEMBLE;
  }

  const [amplitude, depth, repair] = await Promise.all([
    selectBanditModel(databaseUrl, 'mutate_amplitude'),
    selectBanditModel(databaseUrl, 'mutate_depth'),
    selectBanditModel(databaseUrl, 'mutate_repair'),
  ]);

  return {
    amplitude: amplitude ?? DEFAULT_ENSEMBLE.amplitude,
    depth: depth ?? DEFAULT_ENSEMBLE.depth,
    repair: repair ?? DEFAULT_ENSEMBLE.repair,
  };
}

function summarizeRecords(records: CandidateRecord[]) {
  const byOperator = new Map<
    string,
    { operator: string; generated: number; validFinal: number; model: string }
  >();
  for (const record of records) {
    let row = byOperator.get(record.operator);
    if (!row) {
      row = {
        operator: record.operator,
        generated: 0,
        validFinal: 0,
        model: record.model,
      };
      byOperator.set(record.operator, row);
    }
    row.generated += 1;
    if (record.validFinal) row.validFinal += 1;
  }
  return [...byOperator.values()];
}

/** Registra recompensas bandit tras un lote de mutación (mutate o evolve). */
export async function recordMutationBanditRewards(
  databaseUrl: string,
  records: CandidateRecord[],
  context: { telemetryPath?: string; generation?: number } = {},
): Promise<void> {
  if (!(await pingEvolabDatabase(databaseUrl))) return;

  for (const summary of summarizeRecords(records)) {
    const taskType =
      summary.operator === 'role_swap' || summary.operator === 'step_injection'
        ? 'mutate_amplitude'
        : 'mutate_depth';
    await recordBanditReward(databaseUrl, {
      taskType,
      modelName: summary.model,
      reward: rewardFromValidRate(summary.validFinal, summary.generated),
      context: {
        operator: summary.operator,
        ...context,
      },
    });
  }

  const repairUsed = records.some((r) => r.repaired && r.validFinal);
  if (repairUsed) {
    const repairModel = records.find((r) => r.repaired)?.model ?? DEFAULT_ENSEMBLE.repair;
    const repaired = records.filter((r) => r.repaired);
    const repairOk = repaired.filter((r) => r.validFinal).length;
    await recordBanditReward(databaseUrl, {
      taskType: 'mutate_repair',
      modelName: repairModel,
      reward: rewardFromValidRate(repairOk, repaired.length),
      context: { ...context, phase: 'repair' },
    });
  }
}
