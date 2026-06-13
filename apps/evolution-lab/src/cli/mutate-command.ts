import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadEvolabConfig } from '../config/env.js';
import { pingEvolabDatabase } from '../persistence/client.js';
import { createFileEmbeddingCache, createOllamaEmbeddingsClient } from '../fitness/novelty.js';
import {
  runMutationPipeline,
  DEFAULT_NOVELTY_THRESHOLD,
  type CandidateRecord,
  type MutationPipelineResult,
} from '../mutation/pipeline.js';
import {
  wrapEmbeddingsClientWithGpuOrchestrator,
  wrapMutationClientWithGpuOrchestrator,
} from '../gpu/wrap-clients.js';
import { createOllamaScenarioMutationClient } from '../mutation/ollama-mutator.js';
import {
  createOperators,
  MUTATION_OPERATOR_NAMES,
  type MutationOperatorName,
} from '../mutation/operators.js';
import { recordMutationBanditRewards, resolveMutationEnsemble } from '../mutation/ensemble.js';
import { listScenarios, scenariosDirectory } from '../scenarios/loader.js';

export type MutateCommandOptions = {
  count: number;
  operator?: string;
  seedScenario?: string;
  noveltyThreshold?: number;
  json?: boolean;
};

type OperatorSummary = {
  operator: string;
  generated: number;
  validDirect: number;
  repaired: number;
  validFinal: number;
  accepted: number;
  discarded: Record<string, number>;
};

function summarizeByOperator(records: CandidateRecord[]): OperatorSummary[] {
  const byOperator = new Map<string, OperatorSummary>();
  for (const record of records) {
    let summary = byOperator.get(record.operator);
    if (!summary) {
      summary = {
        operator: record.operator,
        generated: 0,
        validDirect: 0,
        repaired: 0,
        validFinal: 0,
        accepted: 0,
        discarded: {},
      };
      byOperator.set(record.operator, summary);
    }
    summary.generated += 1;
    if (record.validDirect) summary.validDirect += 1;
    if (record.repaired && record.validFinal) summary.repaired += 1;
    if (record.validFinal) summary.validFinal += 1;
    if (record.status === 'accepted') summary.accepted += 1;
    if (record.status === 'discarded' && record.discardReason) {
      summary.discarded[record.discardReason] = (summary.discarded[record.discardReason] ?? 0) + 1;
    }
  }
  return [...byOperator.values()];
}

function pct(part: number, total: number): string {
  return total === 0 ? '—' : `${((part / total) * 100).toFixed(0)}%`;
}

function printSummary(result: MutationPipelineResult): void {
  const summaries = summarizeByOperator(result.records);
  const total = result.records.length;
  const validFinal = result.records.filter((r) => r.validFinal).length;
  const validDirect = result.records.filter((r) => r.validDirect).length;

  console.log('EPIS2 Evolab — mutate (motor de mutación LLM, Sprint 8)\n');
  console.log('operador               gen  válid.dir  reparadas  válid.fin  aceptadas  descartes');
  for (const s of summaries) {
    const discards =
      Object.entries(s.discarded)
        .map(([reason, n]) => `${reason}:${n}`)
        .join(' ') || '—';
    console.log(
      `  ${s.operator.padEnd(20)} ${String(s.generated).padStart(3)}  ${String(s.validDirect).padStart(9)}  ${String(s.repaired).padStart(9)}  ${String(s.validFinal).padStart(9)}  ${String(s.accepted).padStart(9)}  ${discards}`,
    );
  }
  console.log(
    `\nValidez directa: ${validDirect}/${total} (${pct(validDirect, total)}) · ` +
      `Validez final (post-reparación): ${validFinal}/${total} (${pct(validFinal, total)}) · gate ≥70%`,
  );
  console.log(`Duración total: ${(result.totalDurationMs / 1000).toFixed(1)} s`);
  if (!result.noveltyAvailable) {
    console.log('⚠ Novedad bge-m3 no disponible — dedup solo estructural');
  }
  if (result.acceptedPaths.length > 0) {
    console.log('\nCandidatos aceptados (requieren revisión humana antes de entrar al corpus):');
    for (const path of result.acceptedPaths) {
      console.log(`  ${path}`);
    }
  } else {
    console.log('\nSin candidatos aceptados.');
  }
}

function writeTelemetry(result: MutationPipelineResult, opts: MutateCommandOptions): string {
  const dir = resolve(process.cwd(), 'reports/evolution/mutation');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = join(dir, `mutate-${stamp}.json`);
  writeFileSync(
    path,
    JSON.stringify(
      {
        options: {
          count: opts.count,
          operator: opts.operator ?? 'all',
          seedScenario: opts.seedScenario ?? null,
          noveltyThreshold: opts.noveltyThreshold ?? DEFAULT_NOVELTY_THRESHOLD,
        },
        summary: summarizeByOperator(result.records),
        noveltyAvailable: result.noveltyAvailable,
        totalDurationMs: result.totalDurationMs,
        records: result.records,
      },
      null,
      2,
    ),
    'utf8',
  );
  return path;
}

/**
 * `evolab mutate --count N [--operator X] [--seed-scenario id] [--json]`
 * (S8.5): genera variantes con el ensemble 7b/14b, valida en 3 capas, repara
 * una vez y escribe candidatos en scenarios/candidates/ (fuera del corpus).
 */
export async function runMutate(opts: MutateCommandOptions): Promise<number> {
  const config = loadEvolabConfig();

  if (opts.operator && !(MUTATION_OPERATOR_NAMES as readonly string[]).includes(opts.operator)) {
    console.error(`Operador desconocido: ${opts.operator} (${MUTATION_OPERATOR_NAMES.join(', ')})`);
    return 1;
  }

  const corpus = listScenarios().filter((s) => (s.flow ?? []).length > 0);
  if (corpus.length === 0) {
    console.error('Sin escenarios con flow en el corpus (apps/evolution-lab/scenarios)');
    return 1;
  }
  if (opts.seedScenario && !corpus.some((s) => s.id === opts.seedScenario)) {
    console.error(`Escenario semilla sin flow o inexistente: ${opts.seedScenario}`);
    return 1;
  }

  let ensemble = await resolveMutationEnsemble(config.databaseUrl);

  const operators = createOperators(ensemble).filter(
    (op) => !opts.operator || op.name === (opts.operator as MutationOperatorName),
  );
  const client = wrapMutationClientWithGpuOrchestrator(
    config.ollamaUrl,
    createOllamaScenarioMutationClient({ baseUrl: config.ollamaUrl }),
  );
  const embeddings = wrapEmbeddingsClientWithGpuOrchestrator(
    config.ollamaUrl,
    createOllamaEmbeddingsClient({
      baseUrl: config.ollamaUrl,
      ...(config.embeddingModel ? { model: config.embeddingModel } : {}),
    }),
  );

  const result = await runMutationPipeline({
    count: opts.count,
    operators,
    corpus,
    client,
    outputDir: join(scenariosDirectory(), 'candidates'),
    repairModel: ensemble.repair,
    embeddings,
    embeddingCache: createFileEmbeddingCache(),
    ...(opts.seedScenario ? { seedScenarioId: opts.seedScenario } : {}),
    ...(opts.noveltyThreshold !== undefined ? { noveltyThreshold: opts.noveltyThreshold } : {}),
  });

  const telemetryPath = writeTelemetry(result, opts);

  if (config.databaseUrl) {
    await recordMutationBanditRewards(config.databaseUrl, result.records, { telemetryPath });
  }

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          summary: summarizeByOperator(result.records),
          acceptedPaths: result.acceptedPaths,
          noveltyAvailable: result.noveltyAvailable,
          totalDurationMs: result.totalDurationMs,
          telemetryPath,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  printSummary(result);
  console.log(`\nTelemetría: ${telemetryPath}`);
  return 0;
}
