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
} from './cli/commands.js';
import { EvolutionOrchestrator } from './orchestrator/orchestrator.js';
import { replayRun } from './replay/replay.js';
import { regenerateRun, type RegenerateStrategy } from './replay/regenerate.js';

function parseArgs(argv: string[]): {
  command: string;
  flags: Record<string, string>;
  booleans: Record<string, boolean>;
} {
  const args = argv.slice(2);
  const command = args[0] ?? 'help';
  const flags: Record<string, string> = {};
  const booleans: Record<string, boolean> = {};
  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--all') {
      booleans.all = true;
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
    if (arg?.startsWith('--') && args[i + 1] && !args[i + 1]!.startsWith('--')) {
      flags[arg.slice(2)] = args[i + 1]!;
      i += 1;
    }
  }
  return { command, flags, booleans };
}

function printRunSummary(
  result: Awaited<ReturnType<EvolutionOrchestrator['executeRun']>>,
): void {
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
  const { command, flags, booleans } = parseArgs(process.argv);

  switch (command) {
    case 'doctor':
      return runDoctor();
    case 'models':
      return runModels();
    case 'scenarios':
      return runScenariosList();
    case 'runs':
      return listRecentRuns(Number.parseInt(flags.limit ?? '10', 10) || 10);
    case 'findings':
      return listFindings(
        Number.parseInt(flags.limit ?? '20', 10) || 20,
        flags.status,
      );
    case 'run': {
      const config = loadEvolabConfig();
      const orchestrator = new EvolutionOrchestrator(config);

      if (booleans.all || flags.tag) {
        const summary = await runScenarioBatch(orchestrator, {
          ...(flags.tag ? { tag: flags.tag } : {}),
          ...(booleans.all ? { all: true } : {}),
        });
        console.log(`\nBatch: ${summary.passed}/${summary.total} passed, ${summary.review} human_review`);
        return summary.failed > 0 ? 1 : 0;
      }

      const scenarioId = flags.scenario;
      if (!scenarioId) {
        console.error('Uso: evolab run --scenario <id> | --all | --tag <tag>');
        return 1;
      }
      try {
        const result = await orchestrator.executeRun(scenarioId);
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
      const findingId = flags.finding;
      const decision = flags.decision as 'approved' | 'rejected' | 'duplicate' | undefined;
      if (!findingId || !decision) {
        console.error(
          'Uso: evolab review --finding <uuid> --decision approved|rejected|duplicate [--actor name] [--comment text]',
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
  doctor       Verificar entorno, guards, Ollama (opcional), target
  models       Inventario de modelos Ollama
  scenarios    Listar escenarios declarativos
  runs         Listar runs recientes (--limit N) [PostgreSQL o filesystem]
  findings     Listar hallazgos (--limit N, --status open) — incluye UUID
  queue        Cola human_review (--limit N)
  import       Backfill reports/evolution/runs → PostgreSQL (--dry-run, --force)
  review       Decidir hallazgo (--finding <uuid> --decision approved|rejected|duplicate)
  run          Ejecutar escenario (--scenario <id> | --all | --tag <tag>)
  plan         Plan LLM simulated user (--scenario <id>) sin ejecutar target
  replay       Reproducir run (--run <id>) con mismo seed [filesystem o DB]
  regenerate   Nuevo run desde contexto previo (--run <id> [--strategy exact|new-seed])
  report       Generar reporte (--run <id>)
  validate     Validación interna

Eficiencia (API-first, sin Chromium por defecto):
  EPIS2_EVOLAB_BROWSER=false
  EPIS2_EVOLAB_LLM_SIM=off|plan|execute
  EPIS2_EVOLAB_OLLAMA_REQUIRED=false
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
