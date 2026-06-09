import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { EvaluationResult, Finding } from '../contracts/schemas.js';
import type { EvolutionRun } from '../contracts/schemas.js';
import type { ScenarioDefinition } from '../contracts/schemas.js';

export type RunEvidenceBundle = {
  runDir: string;
  metadataPath: string;
  resultPath: string;
  evaluationPath: string;
  observations: Array<Record<string, unknown>>;
};

export class EvidenceCollector {
  constructor(private readonly reportsDir: string) {}

  runDirectory(runId: string): string {
    return resolve(process.cwd(), this.reportsDir, runId);
  }

  prepare(run: EvolutionRun, scenario: ScenarioDefinition): RunEvidenceBundle {
    const runDir = this.runDirectory(run.id);
    const screenshotsDir = join(runDir, 'screenshots');
    const logsDir = join(runDir, 'logs');
    const apiDir = join(runDir, 'api');
    mkdirSync(screenshotsDir, { recursive: true });
    mkdirSync(logsDir, { recursive: true });
    mkdirSync(apiDir, { recursive: true });
    mkdirSync(join(runDir, 'model'), { recursive: true });

    const metadata = {
      runId: run.id,
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      targetEnvironmentId: run.targetEnvironmentId,
      personaId: run.personaId,
      randomSeed: run.randomSeed,
      modelName: run.modelName,
      startedAt: run.startedAt,
      configuration: run.configuration,
      synthetic: true,
      source: 'epis2_evolab',
    };

    const metadataPath = join(runDir, 'metadata.json');
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    return {
      runDir,
      metadataPath,
      resultPath: join(runDir, 'result.json'),
      evaluationPath: join(runDir, 'evaluation.json'),
      observations: [],
    };
  }

  attachObservation(bundle: RunEvidenceBundle, observation: Record<string, unknown>): void {
    bundle.observations.push(observation);
  }

  writeApiCapture(
    bundle: RunEvidenceBundle,
    label: string,
    payload: Record<string, unknown>,
  ): string {
    const safe = label.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
    const path = join(bundle.runDir, 'api', `${safe}.json`);
    writeFileSync(path, JSON.stringify(sanitize(payload), null, 2));
    return path;
  }

  finalize(
    bundle: RunEvidenceBundle,
    run: EvolutionRun,
    evaluations: EvaluationResult[],
    finalStatus: string,
    findings: Finding[] = [],
  ): void {
    const result = {
      runId: run.id,
      finalStatus,
      completedAt: new Date().toISOString(),
      observations: bundle.observations,
      findingCount: findings.length,
    };
    writeFileSync(bundle.resultPath, JSON.stringify(result, null, 2));
    writeFileSync(
      bundle.evaluationPath,
      JSON.stringify({ runId: run.id, evaluations }, null, 2),
    );
    if (findings.length > 0) {
      writeFileSync(
        join(bundle.runDir, 'findings.json'),
        JSON.stringify({ runId: run.id, findings }, null, 2),
      );
    }
  }

  writeModelCapture(
    bundle: RunEvidenceBundle,
    label: string,
    payload: Record<string, unknown>,
  ): string {
    const safe = label.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
    const path = join(bundle.runDir, 'model', `${safe}.json`);
    writeFileSync(path, JSON.stringify(sanitize(payload), null, 2));
    return path;
  }

  writeLog(bundle: RunEvidenceBundle, label: string, lines: string[]): void {
    const safe = label.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
    const path = join(bundle.runDir, 'logs', `${safe}.log`);
    writeFileSync(path, lines.join('\n'));
  }
}

function sanitize(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (
      lower.includes('password') ||
      lower.includes('secret') ||
      lower.includes('token') ||
      lower.includes('cookie') ||
      lower.includes('authorization')
    ) {
      out[key] = '[REDACTED]';
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      out[key] = sanitize(val as Record<string, unknown>);
    } else {
      out[key] = val;
    }
  }
  return out;
}

export function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}
