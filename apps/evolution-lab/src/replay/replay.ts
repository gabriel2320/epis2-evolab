import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadEvolabConfig } from '../config/env.js';
import { replayRunFromAnySource } from './regenerate.js';

export type ReplayMetadata = {
  runId: string;
  scenarioId: string;
  randomSeed: string;
  targetEnvironmentId?: string;
};

export function loadRunMetadata(runId: string, reportsDir?: string): ReplayMetadata {
  const config = loadEvolabConfig();
  const dir = resolve(process.cwd(), reportsDir ?? config.reportsDir, runId);
  const path = join(dir, 'metadata.json');
  if (!existsSync(path)) {
    throw new Error(`Metadata no encontrada para run ${runId}`);
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as ReplayMetadata;
  if (!raw.scenarioId || !raw.randomSeed) {
    throw new Error(`Metadata incompleta en ${path}`);
  }
  return raw;
}

export async function replayRun(runId: string) {
  return replayRunFromAnySource(runId);
}
