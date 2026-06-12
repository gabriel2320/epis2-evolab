#!/usr/bin/env node
import { loadEvolabConfig } from './config/env.js';
import {
  runDoctor,
  runModels,
  runScenariosList,
  printRunReport,
  listRecentRuns,
  listFindings,
  listReviewQueue,
  runImport,
  runReviewFinding,
  runSimulatedUserPlan,
  runScenarioBatch,
  preflightTarget,
} from './cli/commands.js';
import { runFitnessReport } from './cli/fitness-command.js';
import { runMutate } from './cli/mutate-command.js';
import { runEvolve } from './cli/evolve-command.js';
import { runMetamorphic } from './cli/metamorphic-command.js';
import { runJudgeTriage } from './cli/judge-command.js';
import { runJudgeEval } from './cli/judge-eval-command.js';
import { runBanditReport, runBanditSeed } from './cli/bandit-command.js';
import { runArchivePromote } from './cli/archive-promote-command.js';
import { EvolutionOrchestrator } from './orchestrator/orchestrator.js';
import { replayRun } from './replay/replay.js';
import { regenerateRun, type RegenerateStrategy } from './replay/regenerate.js';

function parseArgs(argv: string[]): {
  command: string;
  flags: Record<string, string>;
  booleans: Record<string, boolean>;
  positionals: string[];
} {
  const args = argv.slice(2);
  const command = args[0] ?? 'help';
  const flags: Record<string, string> = {};
  const booleans: Record<string, boolean> = {};
  const positionals: string[] = [];
  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--all') {
      booleans.all = true;
      continue;
    }
    if (arg === '--json') {
      booleans.json = true;
      continue;
    }
    if (arg === '--judge') {
      booleans.judge = true;
      continue;
    }
    if (arg === '--refresh') {
      booleans.refresh = true;
      continue;
    }
    if (arg === '--mock') {
      booleans.mock = true;
      continue;
    }
    if (arg === '--bandit') {
      booleans.bandit = true;
      continue;
    }
    if (arg === '--seed') {
      booleans.seed = true;
      continue;
    }
    if (arg === '--dry-run') {
      booleans.dryRun = true;
      continue;
    }
    if (arg === '--force') {
      booleans.force = true;
      continue;
    }
    if (arg === '--strict') {
      booleans.strict = true;
      continue;
    }
    if (arg === '--skip-preflight') {
      booleans.skipPreflight = true;
      continue;
    }
    if (arg === '--reset-fixtures') {
      booleans.resetFixtures = true;
      continue;
    }
    if (arg?.startsWith('--') && args[i + 1] && !args[i + 1]!.startsWith('--')) {
      flags[arg.slice(2)] = args[i + 1]!;
      i += 1;
      continue;
    }
    if (arg && !arg.startsWith('--')) {
      positionals.push(arg);
    }
  }
  return { command, flags, booleans, positionals };
}

function printRunSummary(result: Awaited<ReturnType<EvolutionOrchestrator['executeRun']>>): void {
  console.log(result.message);
  console.log(`  run_id: ${result.run.id}`);
  console.log(`  status: ${result.finalStatus ?? result.run.status}`);
  if (result.findingsCount !== undefined && result.findingsCount > 0) {
    console.log(`  findings: ${result.findingsCount}`);
  }
  if (result.evidenceDir) {
    console.log(`  evidence: ${result.evidenceDir}`);
  }
  if (result.evaluations) {
    console.log('\n  Evaluaciones:');
    for (const ev of result.evaluations) {
      const icon = ev.passed ? '✓' : '✗';
      console.log(`    ${icon} ${ev.evaluatorId}: ${ev.message}`);
    }
  }
}

async function main(): Promise<number> {
  const { command, flags, booleans, positionals } = parseArgs(process.argv);

  switch (command) {
    case 'doctor':
      return runDoctor({ ...(booleans.strict ? { strict: true } : {}) });
    case 'models':
      if (booleans.bandit) {
        return runBanditReport({
          ...(booleans.json ? { json: true } : {}),
          ...(booleans.seed ? { seed: true } : {}),
        });
      }
      return runModels();
    case 'scenarios':
      return runScenariosList();
    case 'runs':
      return listRecentRuns(Number.parseInt(flags.limit ?? '10', 10) || 10);
    case 'findings':
      return listFindings(Number.parseInt(flags.limit ?? '20', 10) || 20, flags.status);
    case 'fitness': {
      const subcommand = positionals[0] ?? 'report';
      if (subcommand !== 'report') {
        console.error('Uso: evolab fitness report [--json]');
        return 1;
      }
      return runFitnessReport({ ...(booleans.json ? { json: true } : {}) });
    }
    case 'mutate': {
      const count = Number.parseInt(flags.count ?? '10', 10);
      if (!Number.isFinite(count) || count < 1) {
        console.error('Uso: evolab mutate --count N [--operator X] [--seed-scenario id] [--json]');
        return 1;
      }
      const noveltyThreshold = flags['novelty-threshold']
        ? Number.parseFloat(flags['novelty-threshold'])
        : undefined;
      return runMutate({
        count,
        ...(flags.operator ? { operator: flags.operator } : {}),
        ...(flags['seed-scenario'] ? { seedScenario: flags['seed-scenario'] } : {}),
        ...(noveltyThreshold !== undefined && Number.isFinite(noveltyThreshold)
          ? { noveltyThreshold }
          : {}),
        ...(booleans.json ? { json: true } : {}),
      });
    }
    case 'metamorphic': {
      const subcommand = positionals[0] ?? 'run';
      if (subcommand !== 'run') {
        console.error(
          'Uso: evolab metamorphic run --relation <id> | --tag <tag> | --all [--dry-run] [--json]',
        );
        return 1;
      }
      if (!flags.relation && !flags.tag && !booleans.all && !booleans.dryRun) {
        console.error(
          'Uso: evolab metamorphic run --relation <id> | --tag <tag> | --all [--dry-run] [--json] [--skip-preflight]',
        );
        return 1;
      }
      return runMetamorphic({
        ...(flags.relation ? { relation: flags.relation } : {}),
        ...(flags.tag ? { tag: flags.tag } : {}),
        ...(booleans.all ? { all: true } : {}),
        ...(booleans.dryRun ? { dryRun: true } : {}),
        ...(booleans.json ? { json: true } : {}),
        ...(booleans.skipPreflight ? { skipPreflight: true } : {}),
      });
    }
    case 'evolve': {
      const generations = Number.parseInt(flags.generations ?? '3', 10);
      const budgetMinutes = Number.parseFloat(flags['budget-minutes'] ?? '30');
      const population = flags.population ? Number.parseInt(flags.population, 10) : undefined;
      if (!Number.isFinite(generations) || generations < 1) {
        console.error(
          'Uso: evolab evolve --generations N --budget-minutes M [--population K] [--json] [--dry-run]',
        );
        return 1;
      }
      if (!Number.isFinite(budgetMinutes) || budgetMinutes <= 0) {
        console.error('--budget-minutes debe ser > 0');
        return 1;
      }
      return runEvolve({
        generations,
        budgetMinutes,
        ...(population !== undefined && Number.isFinite(population) ? { population } : {}),
        ...(booleans.json ? { json: true } : {}),
        ...(booleans.dryRun ? { dryRun: true } : {}),
        ...(booleans.skipPreflight ? { skipPreflight: true } : {}),
      });
    }
    case 'run': {
      let config = loadEvolabConfig();

      if (flags.evidence) {
        if (flags.evidence !== 'minimal' && flags.evidence !== 'full') {
          console.error('--evidence debe ser minimal o full');
          return 1;
        }
        config = { ...config, evidenceMode: flags.evidence };
      }

      if (!booleans.skipPreflight) {
        const preflight = await preflightTarget(config);
        if (!preflight.ok) {
          console.error('Preflight target EPIS2 FAILED:\n');
          for (const msg of preflight.messages) {
            console.error(`  ${msg}`);
          }
          console.error('\n(usar --skip-preflight para omitir esta verificación)');
          return 1;
        }
      }

      const orchestrator = new EvolutionOrchestrator(config);

      if (booleans.all || flags.tag) {
        const summary = await runScenarioBatch(orchestrator, {
          ...(flags.tag ? { tag: flags.tag } : {}),
          ...(booleans.all ? { all: true } : {}),
          ...(booleans.resetFixtures ? { resetFixtures: true } : {}),
        });
        console.log(
          `\nBatch: ${summary.passed}/${summary.total} passed, ${summary.review} human_review`,
        );
        return summary.failed > 0 ? 1 : 0;
      }

      const scenarioId = flags.scenario;
      if (!scenarioId) {
        console.error('Uso: evolab run --scenario <id> | --all | --tag <tag>');
        return 1;
      }
      try {
        const result = await orchestrator.executeRun(scenarioId, undefined, {
          ...(booleans.resetFixtures ? { resetFixtures: true } : {}),
        });
        printRunSummary(result);
        return result.finalStatus === 'completed' ? 0 : 1;
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        return 1;
      }
    }
    case 'report': {
      const runId = flags.run;
      if (!runId) {
        console.error('Uso: evolab report --run <run-id>');
        return 1;
      }
      return printRunReport(runId);
    }
    case 'replay': {
      const runId = flags.run;
      if (!runId) {
        console.error('Uso: evolab replay --run <run-id>');
        return 1;
      }
      try {
        const result = await replayRun(runId);
        printRunSummary(result);
        return result.finalStatus === 'completed' ? 0 : 1;
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        return 1;
      }
    }
    case 'regenerate': {
      const runId = flags.run;
      if (!runId) {
        console.error('Uso: evolab regenerate --run <run-id> [--strategy exact|new-seed]');
        return 1;
      }
      const strategy = (flags.strategy ?? 'new-seed') as RegenerateStrategy;
      if (strategy !== 'exact' && strategy !== 'new-seed') {
        console.error('strategy debe ser exact o new-seed');
        return 1;
      }
      try {
        const result = await regenerateRun(runId, strategy);
        printRunSummary(result);
        return result.finalStatus === 'completed' ? 0 : 1;
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        return 1;
      }
    }
    case 'import':
      return runImport({
        ...(booleans.dryRun ? { dryRun: true } : {}),
        ...(booleans.force ? { force: true } : {}),
      });
    case 'queue':
      return listReviewQueue(Number.parseInt(flags.limit ?? '20', 10) || 20);
    case 'review': {
      if (booleans.judge) {
        return runJudgeTriage({
          ...(flags.finding ? { findingId: flags.finding } : {}),
          ...(booleans.dryRun ? { dryRun: true } : {}),
          ...(booleans.refresh ? { refresh: true } : {}),
          ...(booleans.json ? { json: true } : {}),
          ...(booleans.mock ? { mock: true } : {}),
          ...(flags.model ? { model: flags.model } : {}),
        });
      }
      const findingId = flags.finding;
      const decision = flags.decision as 'approved' | 'rejected' | 'duplicate' | undefined;
      if (!findingId || !decision) {
        console.error(
          'Uso humano: evolab review --finding <uuid> --decision approved|rejected|duplicate\n' +
            '       judge: evolab review --judge [--finding uuid] [--dry-run] [--refresh] [--json]',
        );
        return 1;
      }
      if (!['approved', 'rejected', 'duplicate'].includes(decision)) {
        console.error('decision debe ser approved, rejected o duplicate');
        return 1;
      }
      return runReviewFinding({
        findingId,
        decision,
        ...(flags.actor ? { actor: flags.actor } : {}),
        ...(flags.comment ? { comment: flags.comment } : {}),
      });
    }
    case 'judge': {
      const sub = positionals[0] ?? 'eval';
      if (sub === 'eval') {
        return runJudgeEval({
          goldenPath: flags.golden ?? 'apps/evolution-lab/fixtures/judge-golden-v1.json',
          ...(flags.model ? { model: flags.model } : {}),
          ...(booleans.mock ? { mock: true } : {}),
          ...(booleans.json ? { json: true } : {}),
        });
      }
      console.error('Uso: evolab judge eval [--golden path] [--model qwen3:8b] [--mock] [--json]');
      return 1;
    }
    case 'bandit': {
      const sub = positionals[0] ?? 'seed';
      if (sub === 'seed') return runBanditSeed();
      console.error('Uso: evolab bandit seed');
      return 1;
    }
    case 'archive': {
      const sub = positionals[0] ?? 'promote';
      if (sub !== 'promote') {
        console.error(
          'Uso: evolab archive promote [--candidate-id <id>] [--top N] [--dry-run] [--force]',
        );
        return 1;
      }
      const top = flags.top ? Number.parseInt(flags.top, 10) : undefined;
      return runArchivePromote({
        ...(flags['candidate-id'] ? { candidateIds: [flags['candidate-id']] } : {}),
        ...(top !== undefined && Number.isFinite(top) ? { top } : {}),
        ...(booleans.dryRun ? { dryRun: true } : {}),
        ...(booleans.force ? { force: true } : {}),
      });
    }
    case 'plan': {
      const scenarioId = flags.scenario;
      if (!scenarioId) {
        console.error('Uso: evolab plan --scenario <id>');
        return 1;
      }
      return runSimulatedUserPlan(scenarioId);
    }
    case 'validate':
      console.log('Ejecutar: npm run evolab:validate desde raíz');
      return 0;
    case 'help':
    default:
      console.log(`EPIS2 Evolab — Simulated Evolution Laboratory

Comandos:
  doctor       Verificar entorno, guards, Ollama (opcional), target (--strict: falla si target caído)
  models       Inventario de modelos Ollama
  scenarios    Listar escenarios declarativos
  runs         Listar runs recientes (--limit N) [PostgreSQL o filesystem]
  findings     Listar hallazgos (--limit N, --status open) — incluye UUID
  fitness      Mapa de cobertura y novedad del corpus (fitness report [--json])
  mutate       Motor de mutación LLM (--count N [--operator X] [--seed-scenario id] [--novelty-threshold T] [--json])
  metamorphic  Relaciones metamórficas (run --relation <id> | --tag <tag> | --all [--dry-run] [--json])
  evolve       Loop evolutivo MAP-Elites (--generations N --budget-minutes M [--population K] [--json] [--dry-run])
  queue        Cola human_review (--limit N)
  import       Backfill reports/evolution/runs → PostgreSQL (--dry-run, --force)
  review       Decidir hallazgo (--finding <uuid> --decision approved|rejected|duplicate)
               Judge triage (--judge [--finding uuid] [--dry-run] [--refresh] [--json] [--mock])
  judge        Gate eval (judge eval [--golden path] [--mock] [--json])
  models       Inventario Ollama (--bandit [--seed] [--json])
  bandit       Warm-start UCB (bandit seed)
  archive      Promover élites al corpus (archive promote [--top N] [--candidate-id id])
  run          Ejecutar escenario (--scenario <id> | --all | --tag <tag>) [--skip-preflight] [--reset-fixtures] [--evidence minimal|full]
  plan         Plan LLM simulated user (--scenario <id>) sin ejecutar target
  replay       Reproducir run (--run <id>) con mismo seed [filesystem o DB]
  regenerate   Nuevo run desde contexto previo (--run <id> [--strategy exact|new-seed])
  report       Generar reporte (--run <id>)
  validate     Validación interna

Eficiencia (API-first, sin Chromium por defecto):
  EPIS2_EVOLAB_BROWSER=false
  EPIS2_EVOLAB_LLM_SIM=off|plan|execute
  EPIS2_EVOLAB_OLLAMA_REQUIRED=false
  EPIS2_EVOLAB_EVIDENCE=full|minimal (minimal: sin api/, model/, logs/ por run)
`);
      return command === 'help' ? 0 : 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
