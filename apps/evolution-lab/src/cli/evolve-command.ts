import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadEvolabConfig } from '../config/env.js';
import { pingEvolabDatabase } from '../persistence/client.js';
import { preflightTarget } from './commands.js';
import { nicheKey, enumerateNiches, parseNicheKey } from '../evolution/niches.js';
import {
  createArchiveStoreForEvolve,
  runEvolutionLoop,
  type EvolveResult,
} from '../evolution/evolve.js';
import { printEvolveDryRunPreflight } from './evolve-preflight.js';
import { runPreEvolveBaseSmokeGate } from '../evolution/pre-evolve-gate.js';

export type EvolveCommandOptions = {
  generations: number;
  budgetMinutes: number;
  population?: number;
  json?: boolean;
  dryRun?: boolean;
  skipPreflight?: boolean;
  skipBaseSmoke?: boolean;
  focusNicheKeys?: string[];
  checkpointMinutes?: number;
  checkpointMinElites?: number;
};

function formatNiche(n: { role: string; module: string; outcome: string }): string {
  return `${n.role}×${n.module}×${n.outcome}`;
}

function printEvolveReport(result: EvolveResult): void {
  console.log('EPIS2 Evolab — evolve (loop MAP-Elites, Sprint 9+14)\n');
  console.log(
    `Generaciones: ${result.generationsCompleted} · Presupuesto: ${result.budgetMinutes} min · ` +
      `Duración: ${(result.totalDurationMs / 60_000).toFixed(1)} min` +
      (result.budgetExceeded ? ' · ⚠ presupuesto agotado' : '') +
      (result.checkpointStopEarly ? ' · ⏹ checkpoint stop early' : ''),
  );
  if (result.skippedSandboxRuns) {
    console.log(`  Sandbox omitidos (ledger): ${result.skippedSandboxRuns}`);
  }
  console.log(
    `\nGate: ${result.archive.newElitesInPreviouslyEmpty} élites nuevos en nichos previamente vacíos (objetivo ≥5)`,
  );

  console.log('\nPor generación:');
  console.log('  gen  mut  válid  eval  skip  élite+  reempl  cola  desc');
  for (const s of result.summaries) {
    console.log(
      `  ${String(s.generation).padStart(3)}  ${String(s.mutationsAttempted).padStart(3)}  ` +
        `${String(s.mutationsValid).padStart(5)}  ${String(s.evaluated).padStart(4)}  ` +
        `${String(s.skippedLedger).padStart(4)}  ${String(s.newElites).padStart(6)}  ` +
        `${String(s.replacedElites).padStart(6)}  ` +
        `${String(s.keptCandidates).padStart(4)}  ${String(s.discarded).padStart(4)}`,
    );
  }

  console.log(`\nArchivo MAP-Elites (${result.archive.elites.length} élites vigentes):`);
  for (const e of result.archive.elites) {
    console.log(
      `  ✓ ${formatNiche(e.niche).padEnd(28)} score=${e.fitness.score.toFixed(2)}  ${e.candidateId}`,
    );
  }

  const totalNiches = enumerateNiches().length;
  console.log(`\nCeldas vacías (${result.archive.emptyNiches.length}/${totalNiches}):`);
  const sample = result.archive.emptyNiches.slice(0, 12);
  for (const n of sample) {
    console.log(`  · ${formatNiche(n)}`);
  }
  if (result.archive.emptyNiches.length > 12) {
    console.log(`  … y ${result.archive.emptyNiches.length - 12} más`);
  }

  console.log(`\nCandidatos en cola human_review: ${result.archive.candidatesPending}`);

  if (result.checkpointReportPath) {
    console.log(`\nCheckpoint: ${result.checkpointReportPath}`);
  }
}

function writeTelemetry(result: EvolveResult, opts: EvolveCommandOptions): string {
  const dir = resolve(process.cwd(), 'reports/evolution/evolve');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = join(dir, `evolve-${stamp}.json`);
  writeFileSync(
    path,
    JSON.stringify(
      {
        options: opts,
        result,
        gatePassed: result.archive.newElitesInPreviouslyEmpty >= 5,
      },
      null,
      2,
    ),
    'utf8',
  );
  return path;
}

export function parseFocusNicheKeys(raw: string | undefined): string[] | undefined {
  if (!raw?.trim()) return undefined;
  const keys = raw
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  const invalid = keys.filter((k) => !parseNicheKey(k));
  if (invalid.length > 0) {
    throw new Error(`Nichos inválidos: ${invalid.join(', ')} (formato rol|modulo|outcome)`);
  }
  return keys;
}

/**
 * `evolab evolve --generations N --budget-minutes M [--population K] [--json] [--dry-run]`
 */
export async function runEvolve(opts: EvolveCommandOptions): Promise<number> {
  const config = loadEvolabConfig();

  if (opts.dryRun) {
    await printEvolveDryRunPreflight(config, opts);
  }

  if (!opts.dryRun && !opts.skipPreflight) {
    const preflight = await preflightTarget(config);
    if (!preflight.ok) {
      console.error('Preflight target EPIS2 FAILED:\n');
      for (const msg of preflight.messages) console.error(`  ${msg}`);
      console.error('\n(usar --skip-preflight solo si sandbox caído irrecuperable)');
      return 1;
    }
  }

  if (!opts.dryRun && !opts.skipBaseSmoke) {
    console.log('Gate pre-evolve (escenarios base)…\n');
    const smoke = await runPreEvolveBaseSmokeGate();
    for (const msg of smoke.messages) console.log(msg);
    if (!smoke.ok) {
      console.error('\n(usar --skip-base-smoke solo tras fix EPIS2 confirmado)');
      return 1;
    }
    console.log('');
  }

  if (!opts.dryRun && config.databaseUrl && !(await pingEvolabDatabase(config.databaseUrl))) {
    console.warn('⚠ DB epis2_evolab no disponible — archivo en memoria (no persistente)');
  }

  const store = createArchiveStoreForEvolve(config, opts.dryRun === true);

  const result = await runEvolutionLoop(config, store, {
    generations: opts.generations,
    budgetMinutes: opts.budgetMinutes,
    ...(opts.population !== undefined ? { population: opts.population } : {}),
    ...(opts.dryRun ? { dryRun: true } : {}),
    ...(opts.focusNicheKeys?.length ? { focusNicheKeys: opts.focusNicheKeys } : {}),
    ...(opts.checkpointMinutes ? { checkpointMinutes: opts.checkpointMinutes } : {}),
    ...(opts.checkpointMinElites !== undefined
      ? { checkpointMinElites: opts.checkpointMinElites }
      : {}),
  });

  const telemetryPath = writeTelemetry(result, opts);

  if (opts.json) {
    console.log(
      JSON.stringify(
        { ...result, telemetryPath, gatePassed: result.archive.newElitesInPreviouslyEmpty >= 5 },
        null,
        2,
      ),
    );
    if (opts.dryRun) return 0;
    return result.archive.newElitesInPreviouslyEmpty >= 5 ? 0 : 1;
  }

  printEvolveReport(result);
  console.log(`\nTelemetría: ${telemetryPath}`);

  const gateOk = result.archive.newElitesInPreviouslyEmpty >= 5;
  if (!gateOk && !opts.dryRun && !result.checkpointStopEarly) {
    console.log('\n⚠ Gate no alcanzado (≥5 élites en nichos previamente vacíos)');
  }
  if (result.checkpointStopEarly) {
    console.log('\n⏹ Checkpoint — progreso insuficiente; revisar informe antes de relanzar');
  }
  return opts.dryRun ? 0 : gateOk ? 0 : 1;
}

/** Resumen compacto del archivo para extender fitness report. */
export function archiveStatusSummary(result: EvolveResult): {
  eliteCount: number;
  emptyNicheKeys: string[];
  candidatesPending: number;
} {
  return {
    eliteCount: result.archive.elites.length,
    emptyNicheKeys: result.archive.emptyNiches.map(nicheKey),
    candidatesPending: result.archive.candidatesPending,
  };
}
