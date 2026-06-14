#!/usr/bin/env node
/**
 * F5 extendido — watchdog MAP-Elites + progreso + vigilancia RAM/CPU/GPU (evolab + Ollama).
 */
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildF5Progress,
  f5ExtendedDir,
  f5RunStatePath,
  formatTerminalF5Progress,
  summarizeResources,
  writeF5Progress,
  type F5ProgressSnapshot,
  type F5RunState,
} from '../../apps/evolution-lab/src/evolution/f5-progress.js';
import { evaluateResourceHealth, resolveResourceLimitsForProfile } from '../../apps/evolution-lab/src/evolution/f5-resources.js';
import { sampleF5Resources } from '../../apps/evolution-lab/src/evolution/f5-resource-sampler.js';
import { applyRunProfile, resolveRunProfile } from '../../apps/evolution-lab/src/gpu/run-profile.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LOG_DIR = f5ExtendedDir(ROOT);
const STATE_PATH = f5RunStatePath(ROOT);
const INCIDENTS_PATH = join(LOG_DIR, 'incidents.jsonl');
const RESOURCES_PATH = join(LOG_DIR, 'resources.jsonl');
const HEARTBEAT_PATH = join(LOG_DIR, 'heartbeat.jsonl');
const RUN_LOG_PATH = join(LOG_DIR, 'evolve-run.log');
const SUBAGENT_PROMPT_PATH = join(LOG_DIR, 'subagent-watchdog-prompt.md');

const DEFAULTS = {
  budgetMinutes: 120,
  generations: 24,
  population: 6,
  maxAttempts: 8,
  resourcePollSec: 45,
  resourceWaitRetries: 6,
  checkpointMinutes: 45,
};

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const budgetMinutes = numArg('--budget-minutes', DEFAULTS.budgetMinutes);
const generations = intArg('--generations', DEFAULTS.generations);
const population = intArg('--population', DEFAULTS.population);
const maxAttempts = intArg('--max-attempts', DEFAULTS.maxAttempts);
const resourcePollSec = intArg('--resource-poll-sec', DEFAULTS.resourcePollSec);
const resourceWaitRetries = intArg('--resource-wait-retries', DEFAULTS.resourceWaitRetries);
const checkpointMinutes = numArg('--checkpoint-minutes', DEFAULTS.checkpointMinutes);

function intArg(flag: string, fallback: number): number {
  const i = args.indexOf(flag);
  if (i < 0) return fallback;
  const n = Number.parseInt(args[i + 1] ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

function numArg(flag: string, fallback: number): number {
  const i = args.indexOf(flag);
  if (i < 0) return fallback;
  const n = Number.parseFloat(args[i + 1] ?? '');
  return Number.isFinite(n) ? n : fallback;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function loadState(): F5RunState & {
  incidents: Array<Record<string, unknown>>;
  startedAt?: string;
} {
  if (!existsSync(STATE_PATH)) {
    return {
      runId: `f5-${Date.now()}`,
      startedAt: nowIso(),
      attempts: 0,
      elapsedMinutes: 0,
      incidents: [],
      status: 'pending',
    };
  }
  return JSON.parse(readFileSync(STATE_PATH, 'utf8')) as F5RunState & {
    incidents: Array<Record<string, unknown>>;
  };
}

function saveState(state: F5RunState): void {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function appendJsonl(path: string, row: unknown): void {
  appendFileSync(path, `${JSON.stringify(row)}\n`, 'utf8');
}

function saveProgress(state: F5RunState, overrides: Parameters<typeof buildF5Progress>[0]['overrides'] = {}) {
  const snapshot = buildF5Progress({
    runState: state,
    overrides: {
      budgetMinutes,
      generationsTotal: generations,
      maxAttempts,
      population,
      dryRun,
      ...overrides,
    },
  });
  if (snapshot) writeF5Progress(snapshot, ROOT);
  return snapshot;
}

function runCapture(label: string, npmArgs: string[], cwd = ROOT) {
  const isWin = process.platform === 'win32';
  const bin = isWin ? 'npm.cmd' : 'npm';
  const r = spawnSync(bin, npmArgs, { cwd, encoding: 'utf8', shell: isWin });
  return { label, exitCode: r.status ?? 1, stdout: (r.stdout ?? '').slice(-4000), stderr: (r.stderr ?? '').slice(-4000) };
}

function preflight() {
  const checks = [runCapture('evolab:doctor', ['run', 'evolab:doctor'])];
  const failed = checks.filter((c) => c.exitCode !== 0);
  return { ok: failed.length === 0, failed };
}

function remainingBudget(state: F5RunState): number {
  return Math.max(5, budgetMinutes - (state.elapsedMinutes ?? 0));
}

function remainingGenerations(state: F5RunState): number {
  const done = state.lastGenerationsCompleted ?? 0;
  const left = Math.max(1, generations - done);
  return Math.min(left, Math.max(3, Math.ceil(generations / maxAttempts) + 2));
}

async function checkAndRecordResources(
  state: F5RunState,
  progressOverrides: Parameters<typeof saveProgress>[1] = {},
): Promise<{ ok: boolean; aborted: boolean }> {
  const sample = await sampleF5Resources();
  const limits = resolveResourceLimitsForProfile(resolveRunProfile());
  const health = evaluateResourceHealth(sample, limits);
  appendJsonl(RESOURCES_PATH, { ts: sample.ts, health, sample });
  const resources = summarizeResources(sample, health);
  saveProgress(state, {
    ...progressOverrides,
    resources,
    message:
      health.level === 'ok'
        ? progressOverrides?.message
        : `${health.level.toUpperCase()}: ${health.reasons.join('; ')}`,
  });

  if (health.level === 'critical') {
    console.warn(`\n⚠ Recursos CRÍTICOS (evolab+ollama): ${health.reasons.join(' · ')}`);
    return { ok: false, aborted: true };
  }
  if (health.level === 'warn') {
    console.warn(`  ⚡ Aviso recursos: ${health.reasons.join(' · ')}`);
  }
  console.log(
    `  RAM ${sample.system.usedPercent.toFixed(1)}% · evolab ${sample.evolabRssMb.toFixed(0)} MB · ollama ${sample.ollamaRssMb.toFixed(0)} MB` +
      (sample.gpu ? ` · VRAM ${sample.gpu.usedPercent.toFixed(1)}%` : '') +
      (sample.ollama?.up ? ` · modelos Ollama ${sample.ollama.modelCount}` : ''),
  );
  return { ok: true, aborted: false };
}

async function waitForHealthyResources(state: F5RunState): Promise<boolean> {
  const limits = resolveResourceLimitsForProfile(resolveRunProfile());
  for (let i = 0; i < resourceWaitRetries; i += 1) {
    const sample = await sampleF5Resources();
    const health = evaluateResourceHealth(sample, limits);
    appendJsonl(RESOURCES_PATH, { ts: sample.ts, health, sample, waitAttempt: i + 1 });
    if (health.level !== 'critical') {
      saveProgress(state, {
        phase: 'evolve',
        resources: summarizeResources(sample, health),
        message: health.level === 'warn' ? health.reasons.join('; ') : 'Recursos OK',
      });
      return true;
    }
    const waitSec = health.cooldownSec || 120;
    console.warn(
      `\n⏸ Pausa ${waitSec}s — RAM/GPU alta (solo evolab+ollama). Reintento ${i + 1}/${resourceWaitRetries}`,
    );
    saveProgress(state, {
      phase: 'retry_wait',
      resources: summarizeResources(sample, health),
      message: `Esperando recursos: ${health.reasons.join('; ')}`,
    });
    await sleep(waitSec * 1000);
  }
  return false;
}

function writeSubagentPrompt(incident: Record<string, unknown>): string {
  const body = `# Subagente F5 Watchdog — recuperación

**Generado:** ${nowIso()}  
**Run ID:** ${incident.runId}  
**Intento:** ${incident.attempt}

## Incidente

- **Código salida:** ${incident.exitCode}
- **Motivo:** ${incident.reason}
- **Presupuesto restante (min):** ${incident.remainingBudget}

## Acciones automáticas ya ejecutadas

${((incident.recoverySteps as string[]) ?? []).map((s) => `- ${s}`).join('\n')}

## Recursos

Revisar \`reports/evolution/f5-extended/resources.jsonl\` — umbrales evolab+ollama únicamente.

## Tu misión (Cursor Agent)

1. Leer \`incidents.jsonl\`, \`run-state.json\`, \`resources.jsonl\`.
2. \`npm run evolab:doctor\` · Ollama \`:11434\` · liberar VRAM si modelos huérfanos (\`ollama ps\`).
3. Reanudar: \`npm run evolab:f5:extended\`.
4. Documentar en \`recovery-<fecha>.md\`.
`;
  writeFileSync(SUBAGENT_PROMPT_PATH, body, 'utf8');
  return SUBAGENT_PROMPT_PATH;
}

type EvolveAttemptResult = {
  exitCode: number;
  durationMin: number;
  stdout: string;
  stderr: string;
  parsed?: Record<string, unknown> & {
    generationsCompleted?: number;
    telemetryPath?: string;
    gatePassed?: boolean;
    archive?: { newElitesInPreviouslyEmpty?: number };
  };
  stoppedForResources?: boolean;
};

function runEvolveAttempt(
  state: F5RunState,
  attemptBudget: number,
  attemptGenerations: number,
): Promise<EvolveAttemptResult> {
  return new Promise((resolvePromise) => {
    const evolveArgs = [
      'run',
      'evolab:evolve',
      '--',
      '--generations',
      String(attemptGenerations),
      '--population',
      String(population),
      '--budget-minutes',
      String(attemptBudget),
      '--checkpoint-minutes',
      String(checkpointMinutes),
      '--json',
    ];
    if (dryRun) evolveArgs.push('--dry-run');

    const isWin = process.platform === 'win32';
    const bin = isWin ? 'npm.cmd' : 'npm';
    const started = Date.now();
    let stoppedForResources = false;

    const child = spawn(bin, evolveArgs, {
      cwd: ROOT,
      shell: isWin,
      env: { ...process.env, EPIS2_EVOLAB_F5_WATCHDOG: '1' },
    });

    const resourcePoll = setInterval(() => {
      void (async () => {
        const { ok, aborted } = await checkAndRecordResources(state, {
          phase: 'evolve',
          status: 'running',
          attempt: state.attempts,
        });
        if (!ok && aborted && child.pid) {
          stoppedForResources = true;
          child.kill('SIGTERM');
        }
      })();
    }, resourcePollSec * 1000);

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => {
      const s = d.toString();
      stdout += s;
      appendFileSync(RUN_LOG_PATH, s, 'utf8');
    });
    child.stderr?.on('data', (d) => {
      const s = d.toString();
      stderr += s;
      appendFileSync(RUN_LOG_PATH, s, 'utf8');
    });

    child.on('close', (code) => {
      clearInterval(resourcePoll);
      const durationMin = (Date.now() - started) / 60_000;
      let parsed: EvolveAttemptResult['parsed'];
      try {
        const jsonStart = stdout.lastIndexOf('{');
        if (jsonStart >= 0) parsed = JSON.parse(stdout.slice(jsonStart)) as EvolveAttemptResult['parsed'];
      } catch {
        /* ignore */
      }

      if (parsed?.generationsCompleted != null) {
        state.lastGenerationsCompleted = parsed.generationsCompleted;
      }
      const archive = parsed?.archive as { newElitesInPreviouslyEmpty?: number } | undefined;
      if (archive?.newElitesInPreviouslyEmpty != null) {
        state.newElitesInEmpty = archive.newElitesInPreviouslyEmpty;
      }
      state.elapsedMinutes = (state.elapsedMinutes ?? 0) + durationMin;
      saveState(state);

      resolvePromise({
        exitCode: code ?? 1,
        durationMin,
        stdout: stdout.slice(-8000),
        stderr: stderr.slice(-4000),
        parsed,
        // Evolve puede haber emitido telemetría antes de un SIGTERM tardío del poll de recursos.
        stoppedForResources:
          stoppedForResources && !(parsed?.generationsCompleted != null && parsed.generationsCompleted > 0),
      });
    });
  });
}

function printProgress(snapshot: F5ProgressSnapshot | null | undefined): void {
  if (!snapshot) return;
  console.log(`\n${formatTerminalF5Progress(snapshot)}`);
  console.log('  Consola: npm run evolab:console → http://127.0.0.1:5190/#/f5\n');
}

async function main(): Promise<void> {
  mkdirSync(LOG_DIR, { recursive: true });
  const runProfile = applyRunProfile();
  const state = loadState();
  state.status = 'running';
  saveState(state);
  saveProgress(state, { phase: 'preflight', status: 'pending', message: 'Preflight…' });

  console.log('EPIS2 Evolab — F5 extendido watchdog\n');
  console.log(
    `  Presupuesto: ${budgetMinutes} min · Gen: ${generations} · Pop: ${population}` +
      (dryRun ? ' · DRY-RUN' : ''),
  );
  console.log(`  Perfil GPU: ${runProfile} (EPIS2_EVOLAB_RUN_PROFILE)`);
  console.log(`  Checkpoint:   cada ${checkpointMinutes} min (S14.3)`);
  console.log(`  Vigilancia recursos: cada ${resourcePollSec}s (evolab + ollama · modelos locales)`);
  console.log(`  Logs: ${LOG_DIR}`);
  console.log('  UI: npm run evolab:console → http://127.0.0.1:5190/#/f5\n');

  await checkAndRecordResources(state, { phase: 'preflight', message: 'Muestreo inicial' });

  const pf = preflight();
  appendJsonl(HEARTBEAT_PATH, { ts: nowIso(), event: 'preflight', ok: pf.ok });
  if (!pf.ok && !dryRun) {
    console.warn('⚠ Preflight con fallos — revisar doctor.');
    for (const f of pf.failed) console.warn(`  ✗ ${f.label} exit=${f.exitCode}`);
  }

  while ((state.attempts ?? 0) < maxAttempts) {
    const attemptBudget = remainingBudget(state);
    if (attemptBudget <= 5 && !dryRun) {
      state.status = 'budget_exhausted';
      saveState(state);
      console.log('\nPresupuesto agotado — fin watchdog.');
      break;
    }

    if (!(await waitForHealthyResources(state))) {
      appendJsonl(INCIDENTS_PATH, {
        ts: nowIso(),
        runId: state.runId,
        kind: 'resource_exhausted',
        message: 'Recursos críticos tras esperas — detener watchdog',
      });
      state.status = 'failed';
      saveState(state);
      process.exit(1);
    }

    state.attempts = (state.attempts ?? 0) + 1;
    const attemptGenerations = remainingGenerations(state);
    state.status = 'running';
    saveState(state);
    saveProgress(state, {
      phase: 'evolve',
      status: 'running',
      attempt: state.attempts,
      message: `Intento ${state.attempts}/${maxAttempts} · ${attemptGenerations} gen`,
    });
    console.log(
      `\n▶ Intento ${state.attempts}/${maxAttempts} — ${attemptGenerations} gen · ${attemptBudget.toFixed(1)} min restantes`,
    );

    const result = await runEvolveAttempt(state, attemptBudget, attemptGenerations);
    state.elapsedMinutes = (state.elapsedMinutes ?? 0) + result.durationMin;
    if (result.parsed?.generationsCompleted != null) {
      state.lastGenerationsCompleted =
        (state.lastGenerationsCompleted ?? 0) + result.parsed.generationsCompleted;
    }
    if (result.parsed?.archive?.newElitesInPreviouslyEmpty != null) {
      state.newElitesInEmpty =
        (state.newElitesInEmpty ?? 0) + result.parsed.archive.newElitesInPreviouslyEmpty;
    }

    if (result.stoppedForResources) {
      appendJsonl(INCIDENTS_PATH, {
        ts: nowIso(),
        runId: state.runId,
        attempt: state.attempts,
        kind: 'resource_abort',
        reason: 'Evolve detenido por RAM/GPU crítica (evolab+ollama)',
      });
      console.warn('\n⏹ Evolve detenido por protección de recursos — reintento tras cooldown.');
      await sleep(60_000);
      continue;
    }

    const snap = saveProgress(state, {
      phase: 'evolve',
      status: state.status,
      attempt: state.attempts,
      generationsCompleted: state.lastGenerationsCompleted ?? 0,
      newElitesInEmpty: state.newElitesInEmpty ?? 0,
      message: result.parsed?.telemetryPath
        ? `Telemetría: ${result.parsed.telemetryPath}`
        : undefined,
    });
    printProgress(snap);
    await checkAndRecordResources(state);

    const gatePassed =
      result.parsed?.gatePassed === true ||
      (result.parsed?.archive?.newElitesInPreviouslyEmpty ?? 0) >= 5;
    const evolveOk =
      result.exitCode === 0 || (result.parsed && result.exitCode === 1 && !gatePassed);

    if (evolveOk && gatePassed) {
      state.status = 'completed';
      state.completedAt = nowIso();
      saveState(state);
      saveProgress(state, { phase: 'completed', status: 'completed', message: 'Gate F5 alcanzado' });
      printProgress(buildF5Progress({ runState: state, overrides: { budgetMinutes, generationsTotal: generations, maxAttempts, population, dryRun, phase: 'completed', status: 'completed' } }));
      console.log('\n✓ F5 gate alcanzado — corrida completada.');
      break;
    }

    if (evolveOk && !gatePassed && remainingBudget(state) <= 5) {
      state.status = 'completed_under_gate';
      saveState(state);
      saveProgress(state, {
        phase: 'completed',
        status: 'completed_under_gate',
        message: 'Presupuesto agotado sin gate ≥5',
      });
      console.log('\n⚠ Presupuesto terminado sin gate ≥5 élites vacíos.');
      break;
    }

    if (evolveOk && !gatePassed) {
      console.log('\n… Evolve OK pero gate pendiente — continuando.');
      saveState(state);
      continue;
    }

    const recoverySteps = ['npm run evolab:doctor', 'revisar resources.jsonl'];
    const incident = {
      ts: nowIso(),
      runId: state.runId,
      attempt: state.attempts,
      exitCode: result.exitCode,
      reason: result.stderr.trim() || result.stdout.slice(-500) || 'evolve exit != 0',
      remainingBudget: remainingBudget(state),
      recoverySteps,
      stderrTail: result.stderr,
    };
    if (!state.incidents) state.incidents = [];
    state.incidents.push(incident);
    appendJsonl(INCIDENTS_PATH, incident);
    const promptPath = writeSubagentPrompt(incident);
    saveState(state);
    saveProgress(state, {
      phase: 'retry_wait',
      status: 'running',
      message: `Incidente intento ${state.attempts} — reintento en 15s`,
    });

    console.error(`\n✗ Intento ${state.attempts} falló (exit ${result.exitCode})`);
    console.error(`  Incidente: ${INCIDENTS_PATH}`);
    console.error(`  Subagente: ${promptPath}\n`);

    if ((state.attempts ?? 0) >= maxAttempts) {
      state.status = 'failed';
      saveState(state);
      process.exit(1);
    }

    await sleep(15_000);
  }

  appendJsonl(HEARTBEAT_PATH, {
    ts: nowIso(),
    event: 'finish',
    status: state.status,
    elapsedMinutes: state.elapsedMinutes,
    newElitesInEmpty: state.newElitesInEmpty ?? 0,
  });

  if (state.status === 'running') {
    state.status =
      (state.newElitesInEmpty ?? 0) >= 5 ? 'completed' : 'completed_under_gate';
    state.completedAt = nowIso();
    saveState(state);
  }

  saveProgress(state, { phase: state.status === 'failed' ? 'failed' : 'completed', status: state.status ?? 'completed', message: 'Corrida finalizada' });
  printProgress(buildF5Progress({ runState: state, overrides: { budgetMinutes, generationsTotal: generations, maxAttempts, population, dryRun } }));

  console.log('\nEstado final:', state.status);
  console.log('  run-state:', STATE_PATH);
  process.exit(state.status === 'failed' ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
