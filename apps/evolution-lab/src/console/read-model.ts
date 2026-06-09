import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEvolabConfig } from '../config/env.js';
import { pingEvolabDatabase } from '../persistence/client.js';
import {
  getRunFromDb,
  listFindingsFromDb,
  listHumanReviewRuns,
  listRunsFromDb,
  type FindingListRow,
  type RunListRow,
} from '../persistence/repository.js';
import { listScenarios } from '../scenarios/loader.js';

export type ConsoleHealth = {
  ok: boolean;
  database: boolean;
  databaseUrl?: string;
};

export type RunDetail = {
  run: Record<string, unknown>;
  evaluations: Record<string, unknown>[];
  findings: Record<string, unknown>[];
  filesystem?: {
    result?: unknown;
    metadata?: unknown;
    evaluation?: unknown;
  };
};

export async function getConsoleHealth(databaseUrl: string): Promise<ConsoleHealth> {
  const dbOk = await pingEvolabDatabase(databaseUrl);
  return {
    ok: dbOk,
    database: dbOk,
    databaseUrl: databaseUrl.replace(/:[^:@/]+@/, ':***@'),
  };
}

export async function getDashboard(databaseUrl: string) {
  const [runs, openFindings, queue, scenarios] = await Promise.all([
    listRunsFromDb(databaseUrl, 15),
    listFindingsFromDb(databaseUrl, { limit: 10, reviewStatus: 'open' }),
    listHumanReviewRuns(databaseUrl, 10),
    Promise.resolve(listScenarios()),
  ]);
  return {
    runs,
    openFindings,
    queue,
    scenarioCount: scenarios.length,
    scenarios: scenarios.map((s) => ({
      id: s.id,
      name: s.name,
      risk: s.risk,
      execution: s.execution ?? 'deterministic',
      tags: s.tags ?? [],
    })),
  };
}

export async function getRuns(databaseUrl: string, limit = 20): Promise<RunListRow[]> {
  return listRunsFromDb(databaseUrl, limit);
}

export async function getFindings(
  databaseUrl: string,
  opts: { limit?: number; reviewStatus?: string } = {},
): Promise<FindingListRow[]> {
  return listFindingsFromDb(databaseUrl, opts);
}

export async function getQueue(databaseUrl: string, limit = 20) {
  return listHumanReviewRuns(databaseUrl, limit);
}

export async function getRunDetail(databaseUrl: string, runId: string): Promise<RunDetail | null> {
  const fromDb = await getRunFromDb(databaseUrl, runId);
  if (!fromDb) return null;

  const config = loadEvolabConfig();
  const evidenceDir = String(fromDb.run.evidence_dir ?? join(config.reportsDir, runId));
  const filesystem: RunDetail['filesystem'] = {};

  for (const [key, file] of [
    ['result', 'result.json'],
    ['metadata', 'metadata.json'],
    ['evaluation', 'evaluation.json'],
  ] as const) {
    const path = join(evidenceDir, file);
    if (existsSync(path)) {
      filesystem[key] = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    }
  }

  return {
    run: fromDb.run,
    evaluations: fromDb.evaluations,
    findings: fromDb.findings,
    ...(Object.keys(filesystem).length > 0 ? { filesystem } : {}),
  };
}
