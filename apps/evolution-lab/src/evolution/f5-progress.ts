import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { F5ResourceHealth, F5ResourceSnapshot } from './f5-resources.js';
import { dirname, join, resolve } from 'node:path';

export type F5ProgressPhase =
  | 'idle'
  | 'preflight'
  | 'evolve'
  | 'retry_wait'
  | 'completed'
  | 'failed';

export type F5ProgressSnapshot = {
  updatedAt: string;
  runId?: string;
  status: string;
  phase: F5ProgressPhase;
  dryRun?: boolean;
  budgetMinutes: number;
  elapsedMinutes: number;
  budgetPercent: number;
  generationsTotal: number;
  generationsCompleted: number;
  generationsPercent: number;
  attempt: number;
  maxAttempts: number;
  population: number;
  currentGeneration?: number;
  newElitesInEmpty: number;
  gateTarget: number;
  gatePercent: number;
  lastIncidentAt?: string;
  message?: string;
  resources?: {
    level: 'ok' | 'warn' | 'critical';
    reasons: string[];
    systemUsedPercent: number;
    freeMemMb: number;
    evolabRssMb: number;
    ollamaRssMb: number;
    gpuUsedPercent?: number;
    ollamaModelCount?: number;
  };
};

export type F5RunState = {
  runId?: string;
  startedAt?: string;
  completedAt?: string;
  attempts?: number;
  elapsedMinutes?: number;
  lastGenerationsCompleted?: number;
  newElitesInEmpty?: number;
  status?: string;
  incidents?: Array<{ ts?: string }>;
};

const GATE_TARGET = 5;

export function summarizeResources(
  snapshot: F5ResourceSnapshot,
  health: F5ResourceHealth,
): NonNullable<F5ProgressSnapshot['resources']> {
  return {
    level: health.level,
    reasons: health.reasons,
    systemUsedPercent: snapshot.system.usedPercent,
    freeMemMb: snapshot.system.freeMemMb,
    evolabRssMb: snapshot.evolabRssMb,
    ollamaRssMb: snapshot.ollamaRssMb,
    ...(snapshot.gpu ? { gpuUsedPercent: snapshot.gpu.usedPercent } : {}),
    ...(snapshot.ollama ? { ollamaModelCount: snapshot.ollama.modelCount } : {}),
  };
}

export function f5ExtendedDir(cwd = process.cwd()): string {
  return resolve(cwd, 'reports/evolution/f5-extended');
}

export function f5ProgressPath(cwd = process.cwd()): string {
  return join(f5ExtendedDir(cwd), 'progress.json');
}

export function f5RunStatePath(cwd = process.cwd()): string {
  return join(f5ExtendedDir(cwd), 'run-state.json');
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return clampPercent((part / total) * 100);
}

export function buildF5Progress(input: {
  runState?: F5RunState | null;
  overrides?: Partial<F5ProgressSnapshot> & {
    budgetMinutes?: number;
    generationsTotal?: number;
    maxAttempts?: number;
    population?: number;
    dryRun?: boolean;
  };
}): F5ProgressSnapshot | null {
  const state = input.runState;
  const o = input.overrides ?? {};
  const budgetMinutes = o.budgetMinutes ?? 360;
  const generationsTotal = o.generationsTotal ?? 36;
  const maxAttempts = o.maxAttempts ?? 8;
  const population = o.population ?? 6;
  const elapsedMinutes = o.elapsedMinutes ?? state?.elapsedMinutes ?? 0;
  const generationsCompleted =
    o.generationsCompleted ?? state?.lastGenerationsCompleted ?? 0;
  const newElitesInEmpty = o.newElitesInEmpty ?? state?.newElitesInEmpty ?? 0;
  const status = o.status ?? state?.status ?? 'idle';
  const attempts = o.attempt ?? state?.attempts ?? 0;

  if (status === 'idle' && !state && !o.phase) return null;

  let phase: F5ProgressPhase = o.phase ?? 'idle';
  if (!o.phase) {
    if (status === 'running') phase = 'evolve';
    else if (status === 'pending') phase = 'preflight';
    else if (status === 'failed') phase = 'failed';
    else if (status === 'completed' || status === 'completed_under_gate' || status === 'budget_exhausted') {
      phase = 'completed';
    }
  }

  const lastIncident = state?.incidents?.at(-1);

  return {
    updatedAt: o.updatedAt ?? new Date().toISOString(),
    ...(state?.runId ? { runId: state.runId } : {}),
    status,
    phase,
    ...(o.dryRun ? { dryRun: true } : {}),
    budgetMinutes,
    elapsedMinutes,
    budgetPercent: pct(elapsedMinutes, budgetMinutes),
    generationsTotal,
    generationsCompleted,
    generationsPercent: pct(generationsCompleted, generationsTotal),
    attempt: attempts,
    maxAttempts,
    population,
    ...(o.currentGeneration != null ? { currentGeneration: o.currentGeneration } : {}),
    newElitesInEmpty,
    gateTarget: GATE_TARGET,
    gatePercent: pct(newElitesInEmpty, GATE_TARGET),
    ...(lastIncident?.ts ? { lastIncidentAt: lastIncident.ts } : {}),
    ...(o.message ? { message: o.message } : {}),
    ...(o.resources ? { resources: o.resources } : {}),
  };
}

export function readF5RunState(cwd = process.cwd()): F5RunState | null {
  const path = f5RunStatePath(cwd);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as F5RunState;
  } catch {
    return null;
  }
}

export function readF5Progress(cwd = process.cwd()): F5ProgressSnapshot | null {
  const progressPath = f5ProgressPath(cwd);
  if (existsSync(progressPath)) {
    try {
      return JSON.parse(readFileSync(progressPath, 'utf8')) as F5ProgressSnapshot;
    } catch {
      /* fall through */
    }
  }
  const state = readF5RunState(cwd);
  return buildF5Progress({ runState: state });
}

export function writeF5Progress(
  snapshot: F5ProgressSnapshot,
  cwd = process.cwd(),
): void {
  const dir = f5ExtendedDir(cwd);
  mkdirSync(dir, { recursive: true });
  writeFileSync(f5ProgressPath(cwd), JSON.stringify(snapshot, null, 2), 'utf8');
}

export function terminalProgressBar(percent: number, width = 32): string {
  const p = clampPercent(percent);
  const filled = Math.round((width * p) / 100);
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}

export function formatTerminalF5Progress(p: F5ProgressSnapshot): string {
  const lines = [
    `  Tiempo   [${terminalProgressBar(p.budgetPercent)}] ${p.budgetPercent.toFixed(1)}% (${p.elapsedMinutes.toFixed(1)}/${p.budgetMinutes} min)`,
    `  Gen      [${terminalProgressBar(p.generationsPercent)}] ${p.generationsCompleted}/${p.generationsTotal}` +
      (p.currentGeneration != null ? ` · gen actual ${p.currentGeneration}` : ''),
    `  Gate F5  [${terminalProgressBar(p.gatePercent)}] ${p.newElitesInEmpty}/${p.gateTarget} élites en nichos vacíos`,
    `  Estado: ${p.status} · fase ${p.phase} · intento ${p.attempt}/${p.maxAttempts}`,
  ];
  if (p.message) lines.push(`  ${p.message}`);
  if (p.resources) {
    lines.push(
      `  Recursos [${p.resources.level}] RAM ${p.resources.systemUsedPercent.toFixed(1)}% · libre ${p.resources.freeMemMb.toFixed(0)} MB · evolab ${p.resources.evolabRssMb.toFixed(0)} MB · ollama ${p.resources.ollamaRssMb.toFixed(0)} MB` +
        (p.resources.gpuUsedPercent != null
          ? ` · VRAM ${p.resources.gpuUsedPercent.toFixed(1)}%`
          : ''),
    );
  }
  return lines.join('\n');
}

export function printTerminalF5Progress(p: F5ProgressSnapshot): void {
  console.log(formatTerminalF5Progress(p));
}
