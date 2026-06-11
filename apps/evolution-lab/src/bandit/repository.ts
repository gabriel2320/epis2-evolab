import type { JSONValue } from 'postgres';
import { getEvolabSql } from '../persistence/client.js';
import { computeUcbScore, selectBestArm, type BanditArm, type BanditTaskType } from './ucb.js';
import { BANDIT_TASK_MODELS, SPRINT8_WARM_START } from './warm-start-data.js';

export type BanditStatsRow = {
  taskType: BanditTaskType;
  modelName: string;
  pulls: number;
  totalReward: number;
  lastReward: number | null;
  warmStartSource: string | null;
  meanReward: number;
  ucb: number;
};

type BanditDbRow = {
  task_type: string;
  model_name: string;
  pulls: number;
  total_reward: string | number;
  last_reward: string | number | null;
  warm_start_source: string | null;
};

export async function listBanditStats(
  databaseUrl: string,
  taskType?: BanditTaskType,
): Promise<BanditStatsRow[]> {
  const sql = getEvolabSql(databaseUrl);
  const rows: BanditDbRow[] = taskType
    ? await sql<BanditDbRow[]>`
        SELECT task_type, model_name, pulls, total_reward, last_reward, warm_start_source
        FROM evolution.model_bandit_stats
        WHERE task_type = ${taskType}
        ORDER BY task_type, model_name
      `
    : await sql<BanditDbRow[]>`
        SELECT task_type, model_name, pulls, total_reward, last_reward, warm_start_source
        FROM evolution.model_bandit_stats
        ORDER BY task_type, model_name
      `;

  const byTask = new Map<string, BanditDbRow[]>();
  for (const row of rows) {
    const key = String(row.task_type);
    const list = byTask.get(key) ?? [];
    list.push(row);
    byTask.set(key, list);
  }

  const result: BanditStatsRow[] = [];
  for (const [, taskRows] of byTask) {
    const totalPulls = taskRows.reduce((s, r) => s + Number(r.pulls), 0);
    for (const r of taskRows) {
      const pulls = Number(r.pulls);
      const totalReward = Number(r.total_reward);
      const meanReward = pulls > 0 ? totalReward / pulls : 0;
      result.push({
        taskType: r.task_type as BanditTaskType,
        modelName: String(r.model_name),
        pulls,
        totalReward,
        lastReward: r.last_reward != null ? Number(r.last_reward) : null,
        warmStartSource: r.warm_start_source != null ? String(r.warm_start_source) : null,
        meanReward,
        ucb: computeUcbScore({ pulls, totalReward }, totalPulls),
      });
    }
  }

  return result;
}

export async function selectBanditModel(
  databaseUrl: string,
  taskType: BanditTaskType,
): Promise<string | null> {
  await ensureArmsExist(databaseUrl, taskType);
  const stats = await listBanditStats(databaseUrl, taskType);
  const arms: BanditArm[] = stats.map((s) => ({
    taskType: s.taskType,
    modelName: s.modelName,
    pulls: s.pulls,
    totalReward: s.totalReward,
    meanReward: s.meanReward,
    ucb: s.ucb,
    ...(s.lastReward != null ? { lastReward: s.lastReward } : {}),
  }));
  const best = selectBestArm(arms);
  if (!best) return null;

  const sql = getEvolabSql(databaseUrl);
  await sql`
    UPDATE evolution.model_bandit_stats
    SET last_selected_at = NOW(), updated_at = NOW()
    WHERE task_type = ${taskType} AND model_name = ${best.modelName}
  `;

  return best.modelName;
}

export async function recordBanditReward(
  databaseUrl: string,
  input: {
    taskType: BanditTaskType;
    modelName: string;
    reward: number;
    context?: Record<string, unknown>;
  },
): Promise<void> {
  const reward = Math.min(1, Math.max(0, input.reward));
  const sql = getEvolabSql(databaseUrl);

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO evolution.model_bandit_stats (task_type, model_name, pulls, total_reward, last_reward)
      VALUES (${input.taskType}, ${input.modelName}, 1, ${reward}, ${reward})
      ON CONFLICT (task_type, model_name) DO UPDATE SET
        pulls = evolution.model_bandit_stats.pulls + 1,
        total_reward = evolution.model_bandit_stats.total_reward + ${reward},
        last_reward = ${reward},
        updated_at = NOW()
    `;
    await tx`
      INSERT INTO evolution.model_bandit_events (task_type, model_name, reward, context)
      VALUES (
        ${input.taskType},
        ${input.modelName},
        ${reward},
        ${tx.json((input.context ?? {}) as JSONValue)}
      )
    `;
  });
}

export async function seedBanditWarmStart(
  databaseUrl: string,
  source = 'sprint8-gate',
): Promise<{ inserted: number; skipped: number }> {
  const sql = getEvolabSql(databaseUrl);
  let inserted = 0;
  let skipped = 0;

  for (const entry of SPRINT8_WARM_START) {
    if (source !== 'all' && entry.warmStartSource !== source && source !== 'sprint8-gate') {
      continue;
    }
    const existing = await sql`
      SELECT pulls, warm_start_source FROM evolution.model_bandit_stats
      WHERE task_type = ${entry.taskType} AND model_name = ${entry.modelName}
      LIMIT 1
    `;
    if (existing.length > 0 && existing[0]!.warm_start_source) {
      skipped += 1;
      continue;
    }

    await sql`
      INSERT INTO evolution.model_bandit_stats (
        task_type, model_name, pulls, total_reward, warm_start_source
      ) VALUES (
        ${entry.taskType},
        ${entry.modelName},
        ${entry.pulls},
        ${entry.totalReward},
        ${entry.warmStartSource}
      )
      ON CONFLICT (task_type, model_name) DO UPDATE SET
        pulls = EXCLUDED.pulls,
        total_reward = EXCLUDED.total_reward,
        warm_start_source = EXCLUDED.warm_start_source,
        updated_at = NOW()
      WHERE evolution.model_bandit_stats.warm_start_source IS NULL
    `;
    inserted += 1;
  }

  return { inserted, skipped };
}

export function selectedModelPerTask(stats: BanditStatsRow[]): Map<BanditTaskType, string> {
  const byTask = new Map<BanditTaskType, BanditStatsRow[]>();
  for (const row of stats) {
    const list = byTask.get(row.taskType) ?? [];
    list.push(row);
    byTask.set(row.taskType, list);
  }

  const selected = new Map<BanditTaskType, string>();
  for (const [taskType, rows] of byTask) {
    const best = selectBestArm(
      rows.map((r) => ({
        taskType: r.taskType,
        modelName: r.modelName,
        pulls: r.pulls,
        totalReward: r.totalReward,
        meanReward: r.meanReward,
        ucb: r.ucb,
      })),
    );
    if (best) selected.set(taskType, best.modelName);
  }
  return selected;
}

async function ensureArmsExist(databaseUrl: string, taskType: BanditTaskType): Promise<void> {
  const sql = getEvolabSql(databaseUrl);
  const models = BANDIT_TASK_MODELS[taskType] ?? [];
  for (const modelName of models) {
    await sql`
      INSERT INTO evolution.model_bandit_stats (task_type, model_name)
      VALUES (${taskType}, ${modelName})
      ON CONFLICT (task_type, model_name) DO NOTHING
    `;
  }
}
