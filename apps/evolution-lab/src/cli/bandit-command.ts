import { loadEvolabConfig } from '../config/env.js';
import { pingEvolabDatabase } from '../persistence/client.js';
import {
  listBanditStats,
  seedBanditWarmStart,
  selectedModelPerTask,
} from '../bandit/repository.js';

export async function runBanditReport(opts: { json?: boolean; seed?: boolean }): Promise<number> {
  const config = loadEvolabConfig();
  if (!config.databaseUrl || !(await pingEvolabDatabase(config.databaseUrl))) {
    console.error('models --bandit requiere EPIS2_EVOLAB_DATABASE_URL');
    return 1;
  }

  if (opts.seed) {
    const result = await seedBanditWarmStart(config.databaseUrl);
    console.log(`Bandit warm-start: inserted=${result.inserted} skipped=${result.skipped}`);
  }

  const stats = await listBanditStats(config.databaseUrl);
  const selected = selectedModelPerTask(stats);

  if (opts.json) {
    console.log(JSON.stringify({ stats, selected: Object.fromEntries(selected) }, null, 2));
    return 0;
  }

  console.log('EPIS2 Evolab — bandit UCB\n');
  console.log('Task                 Model                    Pulls  Mean    UCB');
  let lastTask = '';
  for (const row of stats) {
    if (row.taskType !== lastTask) {
      if (lastTask) console.log('');
      lastTask = row.taskType;
    }
    const isSelected = selected.get(row.taskType) === row.modelName;
    const marker = isSelected ? '  ← selected' : '';
    console.log(
      `${row.taskType.padEnd(20)} ${row.modelName.padEnd(24)} ${String(row.pulls).padStart(5)}  ${row.meanReward.toFixed(3).padStart(5)}  ${Number.isFinite(row.ucb) ? row.ucb.toFixed(3).padStart(5) : '   ∞'}${marker}`,
    );
  }

  return 0;
}

export async function runBanditSeed(): Promise<number> {
  const config = loadEvolabConfig();
  if (!config.databaseUrl || !(await pingEvolabDatabase(config.databaseUrl))) {
    console.error('bandit:seed requiere EPIS2_EVOLAB_DATABASE_URL');
    return 1;
  }
  const result = await seedBanditWarmStart(config.databaseUrl);
  console.log(`Warm-start Sprint 8: inserted=${result.inserted} skipped=${result.skipped}`);
  return 0;
}
