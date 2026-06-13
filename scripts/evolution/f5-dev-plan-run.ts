#!/usr/bin/env node
/**
 * F5 dev-plan — corrida MAP-Elites orientada al plan EPIS2 con VRAM controlada.
 *
 * Perfil: dev-plan (browser off, VRAM ≤78% / 9600 MB, un modelo Ollama).
 * Nichos: clínico + RBAC + journey (PROG-EXPERIENCIA-CORE).
 *
 * Uso:
 *   npm run evolab:f5:dev-plan:dry-run
 *   npm run evolab:f5:dev-plan
 *   npm run evolab:f5:dev-plan -- --generations 12 --budget-minutes 90
 */
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyRunProfile } from '../../apps/evolution-lab/src/gpu/run-profile.js';
import { DEV_PLAN_FOCUS_NICHE_KEYS } from '../../apps/evolution-lab/src/gpu/vram-governor.js';
import { DEV_PLAN_F5_RESOURCE_LIMITS } from '../../apps/evolution-lab/src/evolution/f5-resources.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipSmoke = args.includes('--skip-smoke');

const generations = intArg('--generations', 18);
const budgetMinutes = numArg('--budget-minutes', 120);
const population = intArg('--population', 4);
const checkpointMinutes = numArg('--checkpoint-minutes', 40);
const checkpointMinElites = intArg('--checkpoint-min-elites', 2);

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

function runCli(subcommand: string, extraArgs: string[] = []): number {
  const tsxModule = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const cliPath = join(ROOT, 'apps/evolution-lab/src/cli.ts');
  const r = spawnSync(process.execPath, [tsxModule, cliPath, subcommand, ...extraArgs], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
    env: process.env,
    windowsHide: true,
  });
  if (r.error) {
    console.error('runCli error:', r.error.message);
    return 1;
  }
  return r.status ?? 1;
}

function npmRun(script: string, extraArgs: string[] = []): number {
  const isWin = process.platform === 'win32';
  const bin = isWin ? 'npm.cmd' : 'npm';
  const r = spawnSync(bin, ['run', script, '--', ...extraArgs], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: isWin,
    env: process.env,
  });
  return r.status ?? 1;
}

function applyDevPlanEnv(): void {
  applyRunProfile('dev-plan');
  process.env.EPIS2_EVOLAB_RUN_PROFILE = 'dev-plan';
  process.env.EPIS2_EVOLAB_BROWSER = '0';
  process.env.EPIS2_EVOLAB_LLM_CONCURRENCY = '1';
  process.env.EPIS2_EVOLAB_EVIDENCE = process.env.EPIS2_EVOLAB_EVIDENCE ?? 'minimal';
  process.env.EPIS2_EVOLAB_MAX_GPU_MEM_PERCENT = String(DEV_PLAN_F5_RESOURCE_LIMITS.maxGpuMemPercent);
  process.env.EPIS2_EVOLAB_MAX_GPU_MEM_MB = String(DEV_PLAN_F5_RESOURCE_LIMITS.maxGpuMemMb);
  process.env.EPIS2_EVOLAB_GPU_WARN_PERCENT = String(DEV_PLAN_F5_RESOURCE_LIMITS.warnGpuMemPercent);
  process.env.EPIS2_EVOLAB_F5_WATCHDOG = '1';
  if (!process.env.EPIS2_EVOLAB_EMBEDDING_MODEL) {
    process.env.EPIS2_EVOLAB_EMBEDDING_MODEL = 'bge-m3';
  }
}

async function main(): Promise<void> {
  applyDevPlanEnv();
  const runId = `f5-dev-plan-${Date.now()}`;
  const focusNiches = DEV_PLAN_FOCUS_NICHE_KEYS.join(',');

  console.log('EPIS2 Evolab — F5 dev-plan (VRAM controlada + hipótesis EPIS2)\n');
  console.log(`  Run ID:        ${runId}`);
  console.log(`  Perfil:        dev-plan · browser off`);
  console.log(
    `  VRAM límites:  ${process.env.EPIS2_EVOLAB_MAX_GPU_MEM_PERCENT}% · ${process.env.EPIS2_EVOLAB_MAX_GPU_MEM_MB} MB max`,
  );
  console.log(`  Generaciones:  ${generations} · población ${population} · ${budgetMinutes} min`);
  console.log(`  Checkpoint:    ${checkpointMinutes} min · mín ${checkpointMinElites} élites`);
  console.log(`  Focus niches:  ${focusNiches}`);
  console.log('');

  let code = npmRun('evolab:gpu');
  if (code !== 0) {
    console.warn('⚠ GPU status no disponible — continuar si Ollama está up');
  }

  console.log('\nPre-vuelo: descargar modelos Ollama huérfanos si VRAM > warn…');
  console.log('  ollama ps · evolab gpu status · cerrar apps GPU si CRITICAL\n');
  code = npmRun('evolab:doctor');
  if (code !== 0) {
    process.exit(code);
  }

  console.log('\nEvolve pre-vuelo (dry-run interno si --dry-run)…\n');
  const evolveArgs = [
    '--generations',
    String(generations),
    '--budget-minutes',
    String(budgetMinutes),
    '--population',
    String(population),
    '--checkpoint-minutes',
    String(checkpointMinutes),
    '--checkpoint-min-elites',
    String(checkpointMinElites),
    '--focus-niches',
    focusNiches,
    ...(dryRun ? ['--dry-run'] : []),
  ];

  code = runCli('evolve', evolveArgs);
  if (code !== 0 && !dryRun) {
    console.error('\nEvolve terminó con código', code);
  }

  if (!dryRun && !skipSmoke) {
    console.log('\nPost-evolve: pre-evolve smoke…');
    npmRun('evolab:pre-evolve-smoke');
  }

  const briefOut = join(ROOT, 'reports/evolution', `evolab-dev-plan-brief-${new Date().toISOString().slice(0, 10)}.md`);
  npmRun('evolab:dev-plan:brief', ['--out', briefOut, '--run-id', runId]);

  console.log('\nSiguiente paso EPIS2:');
  console.log(`  1. Revisar ${briefOut}`);
  console.log('  2. npm run evolab:hypothesis');
  console.log('  3. Sesión SDEPIS2 — un frente · replay-fingerprint · fix sandbox');
  process.exit(dryRun ? 0 : code);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
