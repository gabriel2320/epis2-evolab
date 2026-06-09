import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { EvaluationResult, EvolutionRun, Finding, RunStatus } from '../contracts/schemas.js';
import { createFindingsFromEvaluations } from '../findings/creator.js';
import { loadEvolabConfig } from '../config/env.js';
import { persistRunBundle, runExistsInDb } from './repository.js';

export type FilesystemRunBundle = {
  run: EvolutionRun;
  evaluations: EvaluationResult[];
  findings: Finding[];
  evidenceDir: string;
  finalStatus: RunStatus | string;
};

type MetadataFile = {
  runId: string;
  scenarioId: string;
  scenarioVersion?: number;
  targetEnvironmentId?: string;
  personaId?: string;
  randomSeed: string;
  modelName?: string;
  startedAt?: string;
  configuration?: Record<string, unknown>;
};

type ResultFile = {
  finalStatus?: RunStatus | string;
  completedAt?: string;
};

type EvaluationFile = {
  evaluations?: EvaluationResult[];
};

type FindingsFile = {
  findings?: Finding[];
};

export function parseRunBundleFromDir(runDir: string): FilesystemRunBundle | null {
  const metaPath = join(runDir, 'metadata.json');
  const resultPath = join(runDir, 'result.json');
  const evalPath = join(runDir, 'evaluation.json');
  if (!existsSync(metaPath) || !existsSync(resultPath)) {
    return null;
  }

  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as MetadataFile;
  const result = JSON.parse(readFileSync(resultPath, 'utf8')) as ResultFile;
  const evalRaw = existsSync(evalPath)
    ? (JSON.parse(readFileSync(evalPath, 'utf8')) as EvaluationFile)
    : { evaluations: [] };

  const runId = meta.runId ?? runDir.split(/[/\\]/).pop()!;
  const finalStatus = (result.finalStatus ?? 'completed') as RunStatus | string;
  const run: EvolutionRun = {
    id: runId,
    scenarioId: meta.scenarioId,
    scenarioVersion: meta.scenarioVersion ?? 1,
    targetEnvironmentId: meta.targetEnvironmentId ?? 'epis2-local-sandbox',
    personaId: meta.personaId ?? 'unknown-default',
    status: mapRunStatus(finalStatus),
    randomSeed: meta.randomSeed,
    modelName: meta.modelName,
    startedAt: meta.startedAt,
    completedAt: result.completedAt,
    configuration: meta.configuration,
  };

  const evaluations = evalRaw.evaluations ?? [];
  const findingsPath = join(runDir, 'findings.json');
  let findings: Finding[] = [];
  if (existsSync(findingsPath)) {
    const findingsRaw = JSON.parse(readFileSync(findingsPath, 'utf8')) as FindingsFile;
    findings = findingsRaw.findings ?? [];
  } else if (evaluations.length > 0) {
    findings = createFindingsFromEvaluations({
      runId,
      scenarioId: meta.scenarioId,
      targetEnvironmentId: run.targetEnvironmentId,
      evaluations,
    });
  }

  return {
    run,
    evaluations,
    findings,
    evidenceDir: runDir,
    finalStatus,
  };
}

function mapRunStatus(finalStatus: string): RunStatus {
  const allowed: RunStatus[] = [
    'pending',
    'running',
    'completed',
    'failed',
    'human_review',
    'cancelled',
  ];
  return allowed.includes(finalStatus as RunStatus) ? (finalStatus as RunStatus) : 'completed';
}

export type BackfillResult = {
  scanned: number;
  imported: number;
  skipped: number;
  errors: string[];
};

export async function backfillRunsFromFilesystem(opts: {
  reportsDir?: string;
  databaseUrl: string;
  dryRun?: boolean;
  force?: boolean;
}): Promise<BackfillResult> {
  const config = loadEvolabConfig();
  const root = resolve(process.cwd(), opts.reportsDir ?? config.reportsDir);
  const result: BackfillResult = { scanned: 0, imported: 0, skipped: 0, errors: [] };

  if (!existsSync(root)) {
    result.errors.push(`Directorio de runs no existe: ${root}`);
    return result;
  }

  const dirs = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(root, d.name));

  for (const runDir of dirs) {
    result.scanned += 1;
    try {
      const bundle = parseRunBundleFromDir(runDir);
      if (!bundle) {
        result.skipped += 1;
        continue;
      }

      const exists = await runExistsInDb(opts.databaseUrl, bundle.run.id);
      if (exists && !opts.force) {
        result.skipped += 1;
        continue;
      }

      if (opts.dryRun) {
        result.imported += 1;
        continue;
      }

      await persistRunBundle({
        databaseUrl: opts.databaseUrl,
        run: bundle.run,
        evaluations: bundle.evaluations,
        findings: bundle.findings,
        evidenceDir: bundle.evidenceDir,
        finalStatus: bundle.finalStatus,
      });
      result.imported += 1;
    } catch (err) {
      result.errors.push(
        `${runDir}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return result;
}
