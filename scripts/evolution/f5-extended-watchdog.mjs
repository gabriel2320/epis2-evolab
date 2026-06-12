#!/usr/bin/env node
/**
 * F5 extendido — watchdog de corrida MAP-Elites (6 h).
 * Vigila preflight, ejecuta evolve, registra incidentes y reintenta con presupuesto restante.
 *
 * Uso:
 *   node scripts/evolution/f5-extended-watchdog.mjs
 *   node scripts/evolution/f5-extended-watchdog.mjs --dry-run
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LOG_DIR = join(ROOT, 'reports/evolution/f5-extended');
const STATE_PATH = join(LOG_DIR, 'run-state.json');
const INCIDENTS_PATH = join(LOG_DIR, 'incidents.jsonl');
const HEARTBEAT_PATH = join(LOG_DIR, 'heartbeat.jsonl');
const RUN_LOG_PATH = join(LOG_DIR, 'evolve-run.log');
const SUBAGENT_PROMPT_PATH = join(LOG_DIR, 'subagent-watchdog-prompt.md');

const DEFAULTS = {
  budgetMinutes: 360,
  generations: 36,
  population: 6,
  maxAttempts: 8,
  heartbeatMinutes: 5,
  preflightEveryMinutes: 30,
};

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const budgetMinutes = numArg('--budget-minutes', DEFAULTS.budgetMinutes);
const generations = intArg('--generations', DEFAULTS.generations);
const population = intArg('--population', DEFAULTS.population);
const maxAttempts = intArg('--max-attempts', DEFAULTS.maxAttempts);

function intArg(flag, fallback) {
  const i = args.indexOf(flag);
  if (i < 0) return fallback;
  const n = Number.parseInt(args[i + 1] ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

function numArg(flag, fallback) {
  const i = args.indexOf(flag);
  if (i < 0) return fallback;
  const n = Number.parseFloat(args[i + 1] ?? '');
  return Number.isFinite(n) ? n : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function loadState() {
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
  return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function appendJsonl(path, row) {
  appendFileSync(path, `${JSON.stringify(row)}\n`, 'utf8');
}

function npm(args, opts = {}) {
  const isWin = process.platform === 'win32';
  const bin = isWin ? 'npm.cmd' : 'npm';
  return spawnSync(bin, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: isWin,
    ...opts,
  });
}

function runCapture(label, args, cwd = ROOT) {
  const isWin = process.platform === 'win32';
  const bin = isWin ? 'npm.cmd' : 'npm';
  const r = spawnSync(bin, args, { cwd, encoding: 'utf8', shell: isWin });
  return {
    label,
    exitCode: r.status ?? 1,
    stdout: (r.stdout ?? '').slice(-4000),
    stderr: (r.stderr ?? '').slice(-4000),
  };
}

function preflight() {
  const checks = [];
  checks.push(runCapture('evolab:doctor', ['run', 'evolab:doctor']));
  const failed = checks.filter((c) => c.exitCode !== 0);
  return { ok: failed.length === 0, checks, failed };
}

function remainingBudget(state) {
  return Math.max(5, budgetMinutes - (state.elapsedMinutes ?? 0));
}

function remainingGenerations(state, attemptIndex) {
  const done = state.lastGenerationsCompleted ?? 0;
  const left = Math.max(1, generations - done);
  return Math.min(left, Math.max(3, Math.ceil(generations / maxAttempts) + 2));
}

function writeSubagentPrompt(incident) {
  const body = `# Subagente F5 Watchdog — recuperación

**Generado:** ${nowIso()}  
**Run ID:** ${incident.runId}  
**Intento:** ${incident.attempt}

## Incidente

- **Código salida:** ${incident.exitCode}
- **Motivo:** ${incident.reason}
- **Presupuesto restante (min):** ${incident.remainingBudget}

## Acciones automáticas ya ejecutadas

${(incident.recoverySteps ?? []).map((s) => `- ${s}`).join('\n')}

## Tu misión (Cursor Agent)

1. Leer \`reports/evolution/f5-extended/incidents.jsonl\` (última línea) y \`run-state.json\`.
2. Verificar sandbox: \`npm run evolab:doctor\` · EPIS2 \`npm run dev:api\` · Ollama \`:11434\`.
3. Si Postgres/Ollama caídos: \`npm run evolab:stack\` (requiere EPIS2_ROOT).
4. Reanudar corrida: \`npm run evolab:f5:extended\` (el watchdog retoma presupuesto restante).
5. Documentar causa raíz en \`reports/evolution/f5-extended/recovery-<fecha>.md\`.
6. **No** promover candidatos ni cerrar findings sin revisión humana.

## Telemetría evolve

- Log: \`reports/evolution/f5-extended/evolve-run.log\`
- JSON: \`reports/evolution/evolve/*.json\`

## Invariantes

- Una corrida evolve activa por estación
- Judge no cierra review_status
- Élites promoted intocables
`;
  writeFileSync(SUBAGENT_PROMPT_PATH, body, 'utf8');
  return SUBAGENT_PROMPT_PATH;
}

function runEvolveAttempt(state, attemptBudget, attemptGenerations) {
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
      '--json',
    ];
    if (dryRun) evolveArgs.push('--dry-run');

    const isWin = process.platform === 'win32';
    const bin = isWin ? 'npm.cmd' : 'npm';
    const started = Date.now();
    const child = spawn(bin, evolveArgs, {
      cwd: ROOT,
      shell: isWin,
      env: { ...process.env, EPIS2_EVOLAB_F5_WATCHDOG: '1' },
    });

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
      const durationMin = (Date.now() - started) / 60_000;
      let parsed;
      try {
        const jsonStart = stdout.lastIndexOf('{');
        if (jsonStart >= 0) parsed = JSON.parse(stdout.slice(jsonStart));
      } catch {
        /* ignore */
      }
      resolvePromise({
        exitCode: code ?? 1,
        durationMin,
        stdout: stdout.slice(-8000),
        stderr: stderr.slice(-4000),
        parsed,
      });
    });
  });
}

async function main() {
  mkdirSync(LOG_DIR, { recursive: true });
  const state = loadState();
  state.status = 'running';
  saveState(state);

  console.log('EPIS2 Evolab — F5 extendido watchdog\n');
  console.log(
    `  Presupuesto: ${budgetMinutes} min · Gen: ${generations} · Pop: ${population}` +
      (dryRun ? ' · DRY-RUN' : ''),
  );
  console.log(`  Logs: ${LOG_DIR}\n`);

  const pf = preflight();
  appendJsonl(HEARTBEAT_PATH, { ts: nowIso(), event: 'preflight', ok: pf.ok });
  if (!pf.ok && !dryRun) {
    console.warn('⚠ Preflight con fallos — se intentará evolve igual; revisar doctor.');
    for (const f of pf.failed) console.warn(`  ✗ ${f.label} exit=${f.exitCode}`);
  }

  while (state.attempts < maxAttempts) {
    const attemptBudget = remainingBudget(state);
    if (attemptBudget <= 5 && !dryRun) {
      state.status = 'budget_exhausted';
      saveState(state);
      console.log('\nPresupuesto agotado — fin watchdog.');
      break;
    }

    state.attempts += 1;
    const attemptGenerations = remainingGenerations(state, state.attempts);
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
    if (result.parsed?.telemetryPath) {
      state.lastTelemetryPath = result.parsed.telemetryPath;
    }

    const gatePassed =
      result.parsed?.gatePassed === true ||
      (result.parsed?.archive?.newElitesInPreviouslyEmpty ?? 0) >= 5;

    const evolveOk = result.exitCode === 0 || (result.parsed && result.exitCode === 1 && !gatePassed);

    if (evolveOk && gatePassed) {
      state.status = 'completed';
      state.completedAt = nowIso();
      saveState(state);
      console.log('\n✓ F5 gate alcanzado — corrida completada.');
      break;
    }

    if (evolveOk && !gatePassed && remainingBudget(state) <= 5) {
      state.status = 'completed_under_gate';
      saveState(state);
      console.log('\n⚠ Presupuesto terminado sin gate ≥5 élites vacíos.');
      break;
    }

    if (evolveOk && !gatePassed) {
      console.log('\n… Evolve OK pero gate pendiente — continuando con presupuesto restante.');
      saveState(state);
      continue;
    }

    const recoverySteps = ['npm run evolab:doctor'];
    const pf2 = preflight();
    if (!pf2.ok) recoverySteps.push('preflight falló — revisar EPIS2_ROOT / stack:dev');

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
    state.incidents.push(incident);
    appendJsonl(INCIDENTS_PATH, incident);
    const promptPath = writeSubagentPrompt({ ...incident, runId: state.runId });
    saveState(state);

    console.error(`\n✗ Intento ${state.attempts} falló (exit ${result.exitCode})`);
    console.error(`  Incidente registrado: ${INCIDENTS_PATH}`);
    console.error(`  Prompt subagente: ${promptPath}`);
    console.error('  Adjuntar prompt en Cursor y ejecutar recuperación antes del siguiente intento.\n');

    if (state.attempts >= maxAttempts) {
      state.status = 'failed';
      saveState(state);
      process.exit(1);
    }

    await new Promise((r) => setTimeout(r, 15_000));
  }

  appendJsonl(HEARTBEAT_PATH, {
    ts: nowIso(),
    event: 'finish',
    status: state.status,
    elapsedMinutes: state.elapsedMinutes,
    newElitesInEmpty: state.newElitesInEmpty ?? 0,
  });

  console.log('\nEstado final:', state.status);
  console.log('  run-state:', STATE_PATH);
  process.exit(state.status === 'failed' ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
