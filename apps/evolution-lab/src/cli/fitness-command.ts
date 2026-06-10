import { loadEvolabConfig } from '../config/env.js';
import { listScenarios } from '../scenarios/loader.js';
import { pingEvolabDatabase } from '../persistence/client.js';
import {
  listLatestScenarioFitness,
  type ScenarioFitnessRow,
} from '../persistence/fitness-repository.js';
import { buildFitnessReport, type FitnessReportData } from '../fitness/report.js';
import {
  computeCorpusNovelty,
  createFileEmbeddingCache,
  createOllamaEmbeddingsClient,
} from '../fitness/novelty.js';

function formatNovelty(novelty: number | null): string {
  return novelty === null ? '—' : novelty.toFixed(3);
}

function printCoverageBar(covered: number, total: number): string {
  const width = 20;
  const filled = total === 0 ? 0 : Math.round((covered / total) * width);
  return `[${'█'.repeat(filled)}${'·'.repeat(width - filled)}] ${covered}/${total}`;
}

function printTextReport(data: FitnessReportData, dbRows: ScenarioFitnessRow[] | null): void {
  console.log('EPIS2 Evolab — fitness report (corpus de escenarios)\n');

  console.log('Cobertura por módulo (endpoints del catálogo):');
  for (const m of data.moduleSummary) {
    console.log(`  ${m.module.padEnd(10)} ${printCoverageBar(m.covered, m.total)}`);
  }

  console.log('\nMapa de cobertura — endpoints:');
  for (const cell of data.endpointMatrix) {
    const icon = cell.coveredBy.length > 0 ? '✓' : '·';
    const by = cell.coveredBy.length > 0 ? `← ${cell.coveredBy.join(', ')}` : '(hueco)';
    console.log(`  ${icon} ${cell.key.padEnd(58)} ${by}`);
  }

  console.log('\nMapa de cobertura — eventos de auditoría:');
  for (const cell of data.auditEventMatrix) {
    const icon = cell.coveredBy.length > 0 ? '✓' : '·';
    const by = cell.coveredBy.length > 0 ? `← ${cell.coveredBy.join(', ')}` : '(hueco)';
    console.log(`  ${icon} ${cell.eventType.padEnd(30)} ${by}`);
  }

  console.log('\nEscenarios:');
  const dbByScenario = new Map((dbRows ?? []).map((r) => [r.scenarioId, r]));
  for (const s of data.scenarios) {
    const db = dbByScenario.get(s.id);
    const runInfo = db
      ? `  último run: hallazgos=${db.findingsCount} duración=${db.durationMs}ms`
      : '';
    console.log(
      `  ${s.id.padEnd(36)} endpoints=${String(s.endpoints.length).padStart(2)}  audit=${String(s.auditEvents.length).padStart(2)}  novelty=${formatNovelty(s.novelty)}${runInfo}`,
    );
  }

  console.log('\nResumen de huecos:');
  console.log(`  Endpoints sin cubrir:        ${data.gaps.endpoints.length}`);
  console.log(`  Eventos auditoría sin cubrir: ${data.gaps.auditEvents.length}`);
  if (!data.noveltyAvailable) {
    console.log('\n⚠ Novedad no disponible (Ollama/bge-m3 no respondió) — corpus sin embeddings');
  }
  if (dbRows === null) {
    console.log('⚠ Sin DB epis2_evolab — métricas por run omitidas (solo corpus YAML estático)');
  }
}

/**
 * `evolab fitness report [--json]` (S7.5): mapa de cobertura del corpus YAML
 * contra el catálogo EPIS2 + novedad por embeddings si Ollama está disponible
 * + métricas persistidas si la DB responde. Degrada con gracia sin sandbox,
 * sin Ollama y sin DB.
 */
export async function runFitnessReport(opts: { json?: boolean } = {}): Promise<number> {
  const config = loadEvolabConfig();
  const scenarios = listScenarios();
  if (scenarios.length === 0) {
    console.error('Sin escenarios en el corpus (apps/evolution-lab/scenarios)');
    return 1;
  }

  const client = createOllamaEmbeddingsClient({
    baseUrl: config.ollamaUrl,
    ...(config.embeddingModel ? { model: config.embeddingModel } : {}),
  });
  const novelty = await computeCorpusNovelty(scenarios, client, createFileEmbeddingCache());

  const data = buildFitnessReport(scenarios, novelty);

  let dbRows: ScenarioFitnessRow[] | null = null;
  if (config.databaseUrl && (await pingEvolabDatabase(config.databaseUrl))) {
    try {
      dbRows = await listLatestScenarioFitness(config.databaseUrl);
    } catch {
      dbRows = null;
    }
  }

  if (opts.json) {
    console.log(JSON.stringify({ ...data, persisted: dbRows ?? [] }, null, 2));
    return 0;
  }

  printTextReport(data, dbRows);
  return 0;
}
