import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadEvolabConfig } from '../config/env.js';
import { runSecurityGuards } from '../security/guards.js';
import { OllamaModelRegistry } from '../ollama/model-registry.js';
import { OllamaTaskRouter } from '../ollama/task-router.js';
import { resolveTargetEnvironment } from '../security/target-allowlist.js';
import { listScenarios } from '../scenarios/loader.js';
import { pingEvolabDatabase } from '../persistence/client.js';
import {
  listFindingsFromDb,
  listHumanReviewRuns,
  listRunsFromDb,
  reviewFinding,
} from '../persistence/repository.js';
import { backfillRunsFromFilesystem } from '../persistence/backfill.js';
import { loadScenario } from '../scenarios/loader.js';
import { createSimulatedUserAgent } from '../simulated-user/agent.js';
import type { EvolutionOrchestrator } from '../orchestrator/orchestrator.js';

export async function runDoctor(): Promise<number> {
  console.log('EPIS2 Evolab — doctor\n');
  const config = loadEvolabConfig();
  const guards = runSecurityGuards(config);

  for (const check of guards.checks) {
    const icon = check.passed ? '✓' : check.severity === 'critical' ? '✗' : '⚠';
    console.log(`  ${icon} [${check.severity}] ${check.label}: ${check.message}`);
  }

  const target = resolveTargetEnvironment(config.targetId);
  if (target) {
    console.log(`\n  Target: ${target.name} (${target.environmentType})`);
    console.log(`  Web:    ${target.webBaseUrl}`);
    console.log(`  API:    ${target.apiBaseUrl}`);
  }

  const registry = new OllamaModelRegistry(config.ollamaUrl, config.model);
  const inventory = await registry.discover();
  console.log(`\n  Ollama: ${inventory.up ? '✓ UP' : config.ollamaRequired ? '✗ DOWN' : '⚠ DOWN (opcional)'}`);
  console.log(`  Modelos: ${inventory.models.length}`);
  console.log(`  Seleccionado: ${inventory.selectedModel || '(ninguno)'}`);
  console.log(`  Preferido (${config.model}): ${inventory.preferredAvailable ? '✓' : '✗'}`);
  console.log(`  Browser: ${config.browserEnabled ? 'activo (Playwright)' : 'off (API-first)'}`);
  const llmLabel =
    config.llmSimMode === 'execute'
      ? 'execute (plan→acciones)'
      : config.llmSimMode === 'plan'
        ? 'plan only'
        : 'off';
  console.log(`  LLM sim: ${llmLabel}`);

  try {
    const health = await fetch(`${config.apiBaseUrl}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    console.log(`\n  EPIS2 API health: ${health.ok ? '✓' : '✗'} (${health.status})`);
  } catch {
    console.log('\n  EPIS2 API health: ✗ (no alcanzable — iniciar stack sandbox)');
  }

  const scenarios = listScenarios();
  console.log(`\n  Escenarios cargados: ${scenarios.length}`);

  if (config.databaseUrl) {
    const dbOk = await pingEvolabDatabase(config.databaseUrl);
    console.log(
      `\n  Evolab DB: ${dbOk ? '✓' : '✗'} epis2_evolab (${config.databaseUrl.replace(/:[^:@/]+@/, ':***@')})`,
    );
    if (!dbOk) {
      console.log('  (ejecutar: npm run evolab:db:migrate)');
    }
  } else {
    console.log('\n  Evolab DB: ⚠ EPIS2_EVOLAB_DATABASE_URL no configurada (solo filesystem)');
  }

  console.log('');
  if (!guards.ok) {
    console.error('evolab:doctor FAILED — corregir guards críticos');
    return 1;
  }
  if (config.ollamaRequired && !inventory.up) {
    console.error('evolab:doctor FAILED — Ollama requerido pero no disponible');
    return 1;
  }
  console.log('evolab:doctor OK');
  return 0;
}

export async function runModels(): Promise<number> {
  const config = loadEvolabConfig();
  const registry = new OllamaModelRegistry(config.ollamaUrl, config.model);
  const inventory = await registry.discover();
  const router = new OllamaTaskRouter(config.model, config.fastModel);

  console.log('EPIS2 Evolab — model inventory\n');
  console.log(`  URL: ${inventory.baseUrl}`);
  console.log(`  UP:  ${inventory.up}`);
  console.log(`  Selected: ${inventory.selectedModel}\n`);

  for (const m of inventory.models) {
    const sizeGb = (m.size / 1e9).toFixed(1);
    console.log(`  - ${m.name} (${sizeGb} GB) [${m.capabilities.join(', ')}]`);
  }

  if (inventory.models.length > 0) {
    const names = inventory.models.map((m) => m.name);
    console.log('\n  Rutas:');
    for (const task of ['simulated_user', 'evaluator'] as const) {
      const route = router.route(task, names);
      console.log(`    ${task}: ${route.model} — ${route.reason}`);
    }
  }

  return inventory.up ? 0 : 1;
}

export async function runScenariosList(): Promise<number> {
  const scenarios = listScenarios();
  console.log('EPIS2 Evolab — escenarios\n');
  for (const s of scenarios) {
    console.log(`  ${s.id} v${s.version} [${s.risk}] — ${s.name}`);
  }
  console.log(`\nTotal: ${scenarios.length}`);
  return 0;
}

export function printRunReport(runId: string): number {
  const config = loadEvolabConfig();
  const runDir = resolve(process.cwd(), config.reportsDir, runId);
  if (!existsSync(runDir)) {
    console.error(`Run no encontrado: ${runDir}`);
    return 1;
  }
  console.log(`EPIS2 Evolab — reporte ${runId}\n`);
  for (const file of ['metadata.json', 'result.json', 'evaluation.json', 'findings.json'] as const) {
    const path = join(runDir, file);
    if (existsSync(path)) {
      console.log(`--- ${file} ---`);
      console.log(readFileSync(path, 'utf8'));
    }
  }
  return 0;
}

export async function listRecentRuns(limit = 10): Promise<number> {
  const config = loadEvolabConfig();

  if (config.databaseUrl && (await pingEvolabDatabase(config.databaseUrl))) {
    const rows = await listRunsFromDb(config.databaseUrl, limit);
    console.log('EPIS2 Evolab — runs recientes (PostgreSQL)\n');
    for (const e of rows) {
      console.log(
        `  ${e.id}  [${e.finalStatus}]  ${e.scenarioId}  hallazgos=${e.findingCount}`,
      );
    }
    console.log(`\nTotal listado: ${rows.length}`);
    return 0;
  }

  const root = resolve(process.cwd(), config.reportsDir);
  if (!existsSync(root)) {
    console.log('Sin runs registrados.');
    return 0;
  }
  const entries = readdirSync(root)
    .map((id) => {
      const dir = join(root, id);
      const metaPath = join(dir, 'metadata.json');
      const resultPath = join(dir, 'result.json');
      let mtime = 0;
      let scenarioId = '?';
      let finalStatus = '?';
      try {
        mtime = statSync(dir).mtimeMs;
        if (existsSync(metaPath)) {
          const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { scenarioId?: string };
          scenarioId = meta.scenarioId ?? scenarioId;
        }
        if (existsSync(resultPath)) {
          const result = JSON.parse(readFileSync(resultPath, 'utf8')) as { finalStatus?: string };
          finalStatus = result.finalStatus ?? finalStatus;
        }
      } catch {
        /* skip corrupt */
      }
      return { id, mtime, scenarioId, finalStatus };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit);

  console.log('EPIS2 Evolab — runs recientes\n');
  for (const e of entries) {
    console.log(`  ${e.id}  [${e.finalStatus}]  ${e.scenarioId}`);
  }
  console.log(`\nTotal listado: ${entries.length}`);
  return 0;
}

export async function listFindings(limit = 20, reviewStatus?: string): Promise<number> {
  const config = loadEvolabConfig();
  if (!config.databaseUrl || !(await pingEvolabDatabase(config.databaseUrl))) {
    console.error('findings requiere EPIS2_EVOLAB_DATABASE_URL y npm run evolab:db:migrate');
    return 1;
  }
  const rows = await listFindingsFromDb(config.databaseUrl, {
    limit,
    ...(reviewStatus ? { reviewStatus } : {}),
  });
  console.log('EPIS2 Evolab — hallazgos\n');
  for (const f of rows) {
    console.log(
      `  ${f.id}  [${f.severity}] ${f.fingerprint}  ${f.scenarioId}  run=${f.runId.slice(0, 8)}…  ${f.reviewStatus}`,
    );
    console.log(`    ${f.title}`);
  }
  console.log(`\nTotal: ${rows.length}`);
  return 0;
}

export async function listReviewQueue(limit = 20): Promise<number> {
  const config = loadEvolabConfig();
  if (!config.databaseUrl || !(await pingEvolabDatabase(config.databaseUrl))) {
    console.error('queue requiere EPIS2_EVOLAB_DATABASE_URL');
    return 1;
  }
  const runs = await listHumanReviewRuns(config.databaseUrl, limit);
  console.log('EPIS2 Evolab — cola human_review\n');
  for (const r of runs) {
    console.log(
      `  ${r.id}  ${r.scenarioId}  hallazgos=${r.findingCount}  ${r.startedAt ?? ''}`,
    );
  }
  console.log(`\nTotal: ${runs.length}`);
  return 0;
}

export async function runImport(opts: { dryRun?: boolean; force?: boolean }): Promise<number> {
  const config = loadEvolabConfig();
  if (!config.databaseUrl || !(await pingEvolabDatabase(config.databaseUrl))) {
    console.error('import requiere EPIS2_EVOLAB_DATABASE_URL y npm run evolab:db:migrate');
    return 1;
  }
  const result = await backfillRunsFromFilesystem({
    databaseUrl: config.databaseUrl,
    ...(opts.dryRun ? { dryRun: true } : {}),
    ...(opts.force ? { force: true } : {}),
  });
  console.log('EPIS2 Evolab — backfill filesystem → PostgreSQL\n');
  console.log(`  Escaneados: ${result.scanned}`);
  console.log(`  Importados: ${result.imported}${opts.dryRun ? ' (dry-run)' : ''}`);
  console.log(`  Omitidos:   ${result.skipped}`);
  if (result.errors.length > 0) {
    console.log('\n  Errores:');
    for (const e of result.errors) {
      console.log(`    - ${e}`);
    }
  }
  return result.errors.length > 0 ? 1 : 0;
}

export async function runReviewFinding(input: {
  findingId: string;
  decision: 'approved' | 'rejected' | 'duplicate';
  actor?: string;
  comment?: string;
}): Promise<number> {
  const config = loadEvolabConfig();
  if (!config.databaseUrl || !(await pingEvolabDatabase(config.databaseUrl))) {
    console.error('review requiere EPIS2_EVOLAB_DATABASE_URL');
    return 1;
  }
  const result = await reviewFinding(config.databaseUrl, {
    findingId: input.findingId,
    decision: input.decision,
    actor: input.actor ?? process.env.USER ?? 'evolab-cli',
    ...(input.comment ? { comment: input.comment } : {}),
  });
  console.log(result.message);
  return result.ok ? 0 : 1;
}

export async function runSimulatedUserPlan(scenarioId: string): Promise<number> {
  const config = loadEvolabConfig();
  const scenario = loadScenario(scenarioId);
  const agent = createSimulatedUserAgent(config);
  const result = await agent.planScenario(scenario);
  console.log('EPIS2 Evolab — simulated user plan\n');
  console.log(`  escenario: ${scenario.id}`);
  console.log(`  fuente:    ${result.source}${result.model ? ` (${result.model})` : ''}`);
  if (result.error) console.log(`  aviso:     ${result.error}`);
  console.log(`  pasos:     ${result.plan.steps.length}`);
  console.log(JSON.stringify(result.plan, null, 2));
  return result.source === 'ollama' || result.source === 'fallback' ? 0 : 1;
}

export async function runScenarioBatch(
  orchestrator: EvolutionOrchestrator,
  opts: { all?: boolean; tag?: string },
): Promise<{ total: number; passed: number; review: number; failed: number }> {
  let scenarios = listScenarios();
  if (opts.tag) {
    scenarios = scenarios.filter((s) => s.tags?.includes(opts.tag!));
  }
  if (!opts.all && !opts.tag) {
    throw new Error('Batch requiere --all o --tag');
  }

  let passed = 0;
  let review = 0;
  let failed = 0;

  for (const scenario of scenarios) {
    console.log(`\n▶ ${scenario.id}`);
    try {
      const result = await orchestrator.executeRun(scenario.id);
      if (result.finalStatus === 'completed') passed += 1;
      else if (result.finalStatus === 'human_review') review += 1;
      else failed += 1;
      printRunSummaryInline(result);
    } catch {
      failed += 1;
      console.log('  ✗ error de ejecución');
    }
  }

  return { total: scenarios.length, passed, review, failed };
}

function printRunSummaryInline(
  result: Awaited<ReturnType<EvolutionOrchestrator['executeRun']>>,
): void {
  const icon = result.finalStatus === 'completed' ? '✓' : result.finalStatus === 'human_review' ? '◐' : '✗';
  console.log(`  ${icon} ${result.finalStatus} — ${result.findingsCount ?? 0} hallazgos`);
}
