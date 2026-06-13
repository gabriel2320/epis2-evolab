import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { EvolveResult } from './evolve.js';

export type CheckpointReport = {
  ts: string;
  elapsedMinutes: number;
  newElitesInEmpty: number;
  checkpointMinElites: number;
  generationsCompleted: number;
  recommendation: string;
  emptyNicheSample: string[];
};

export function buildCheckpointReport(
  result: Pick<
    EvolveResult,
    'generationsCompleted' | 'archive' | 'totalDurationMs' | 'checkpointMinElites'
  >,
): CheckpointReport {
  const elapsedMinutes = result.totalDurationMs / 60_000;
  const minElites = result.checkpointMinElites ?? 2;
  const newElites = result.archive.newElitesInPreviouslyEmpty;
  return {
    ts: new Date().toISOString(),
    elapsedMinutes,
    newElitesInEmpty: newElites,
    checkpointMinElites: minElites,
    generationsCompleted: result.generationsCompleted,
    recommendation:
      newElites >= minElites
        ? 'Continuar — gate intermedio OK'
        : 'Stop early — revisar hipótesis EPIS2 / niches focus antes de quemar presupuesto',
    emptyNicheSample: result.archive.emptyNiches.slice(0, 8).map((n) => `${n.role}|${n.module}|${n.outcome}`),
  };
}

export function writeCheckpointReport(report: CheckpointReport): string {
  const dir = resolve(process.cwd(), 'reports/evolution/evolve');
  mkdirSync(dir, { recursive: true });
  const stamp = report.ts.replace(/[:.]/g, '-');
  const path = join(dir, `checkpoint-${stamp}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2), 'utf8');
  return path;
}
