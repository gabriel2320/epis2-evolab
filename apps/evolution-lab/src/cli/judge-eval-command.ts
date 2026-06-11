import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { loadEvolabConfig } from '../config/env.js';
import { buildJudgeInputFromGolden } from '../judge/build-input.js';
import {
  createMockJudgeClient,
  createOllamaJudgeClient,
  DEFAULT_JUDGE_MODEL,
} from '../judge/ollama-judge-client.js';
import { classifyFinding } from '../judge/triage-judge.js';
import type { JudgeTriageOutput } from '../judge/schemas.js';

type GoldenEntry = {
  id: string;
  sourceRunId: string;
  findingSnapshot: Record<string, unknown>;
  goldenVerdict: 'signal' | 'noise' | 'duplicate';
  goldenRationale?: string;
  scenario?: Record<string, unknown>;
  evaluations?: Array<{
    evaluatorId: string;
    passed: boolean;
    severity?: string;
    message: string;
  }>;
  fingerprintHistory?: Array<Record<string, unknown>>;
};

type GoldenFile = {
  version: string;
  entries: GoldenEntry[];
};

function loadGolden(path: string): GoldenFile {
  const raw = readFileSync(resolve(process.cwd(), path), 'utf8');
  return JSON.parse(raw) as GoldenFile;
}

function confusionMatrix(
  predicted: string[],
  golden: string[],
): Record<string, Record<string, number>> {
  const labels = ['signal', 'noise', 'duplicate'];
  const matrix: Record<string, Record<string, number>> = {};
  for (const g of labels) {
    matrix[g] = {};
    for (const p of labels) matrix[g]![p] = 0;
  }
  for (let i = 0; i < golden.length; i += 1) {
    const g = golden[i]!;
    const p = predicted[i]!;
    if (matrix[g]?.[p] !== undefined) matrix[g]![p]! += 1;
  }
  return matrix;
}

function macroF1(matrix: Record<string, Record<string, number>>): number {
  const labels = ['signal', 'noise', 'duplicate'];
  let sum = 0;
  for (const label of labels) {
    const tp = matrix[label]?.[label] ?? 0;
    let fp = 0;
    let fn = 0;
    for (const other of labels) {
      if (other !== label) {
        fp += matrix[other]?.[label] ?? 0;
        fn += matrix[label]?.[other] ?? 0;
      }
    }
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    sum += f1;
  }
  return sum / labels.length;
}

function writeGateReport(opts: {
  path: string;
  accuracy: number;
  correct: number;
  total: number;
  matrix: Record<string, Record<string, number>>;
  macroF1: number;
  signalRecall: number;
  results: Array<{ id: string; golden: string; predicted: string; ok: boolean }>;
}): void {
  const lines = [
    '# EPIS2 Evolab — Sprint 11 judge gate',
    '',
    `**Accuracy:** ${(opts.accuracy * 100).toFixed(1)}% (${opts.correct}/${opts.total})`,
    `**Macro-F1:** ${opts.macroF1.toFixed(3)}`,
    `**Signal recall:** ${(opts.signalRecall * 100).toFixed(1)}%`,
    '',
    '## Confusion matrix (golden → predicted)',
    '',
    '| | signal | noise | duplicate |',
    '|---|---:|---:|---:|',
  ];
  for (const g of ['signal', 'noise', 'duplicate']) {
    const row = opts.matrix[g]!;
    lines.push(`| **${g}** | ${row.signal} | ${row.noise} | ${row.duplicate} |`);
  }
  lines.push('', '## Detalle', '');
  for (const r of opts.results) {
    lines.push(`- ${r.ok ? '✓' : '✗'} ${r.id}: golden=${r.golden} predicted=${r.predicted}`);
  }
  mkdirSync(dirname(opts.path), { recursive: true });
  writeFileSync(opts.path, lines.join('\n'), 'utf8');
}

export async function runJudgeEval(opts: {
  goldenPath: string;
  model?: string;
  mock?: boolean;
  json?: boolean;
}): Promise<number> {
  const config = loadEvolabConfig();
  const golden = loadGolden(opts.goldenPath);
  const expectedPath = opts.goldenPath.replace(/\.json$/, '-expected.json');
  const expectedMap = new Map<string, 'signal' | 'noise' | 'duplicate'>();

  if (opts.mock && existsSync(resolve(process.cwd(), expectedPath))) {
    const expected = JSON.parse(readFileSync(resolve(process.cwd(), expectedPath), 'utf8')) as {
      entries: Array<{ id: string; verdict: 'signal' | 'noise' | 'duplicate' }>;
    };
    for (const e of expected.entries) expectedMap.set(e.id, e.verdict);
  }

  for (const e of golden.entries) {
    expectedMap.set(e.id, e.goldenVerdict);
  }

  const client = opts.mock
    ? createMockJudgeClient((input) => {
        const match = golden.entries.find((g) => g.id === input.finding.id);
        return match?.goldenVerdict ?? 'signal';
      })
    : createOllamaJudgeClient({ baseUrl: config.ollamaUrl });

  const model = opts.model ?? DEFAULT_JUDGE_MODEL;
  const predicted: string[] = [];
  const goldenLabels: string[] = [];
  const detail: Array<{
    id: string;
    golden: string;
    predicted: string;
    ok: boolean;
    output?: JudgeTriageOutput;
  }> = [];

  for (const entry of golden.entries) {
    const input = buildJudgeInputFromGolden({
      sourceRunId: entry.sourceRunId,
      findingSnapshot: { ...entry.findingSnapshot, id: entry.id },
      ...(entry.scenario
        ? {
            scenario: {
              id: String(entry.scenario.id ?? entry.findingSnapshot.scenarioId),
              name: String(entry.scenario.name ?? entry.findingSnapshot.scenarioId),
              risk: String(entry.scenario.risk ?? 'high'),
              personaRole: String(entry.scenario.personaRole ?? 'physician'),
              goalAction: String(entry.scenario.goalAction ?? 'unknown'),
              evaluators: (entry.scenario.evaluators as string[]) ?? [],
            },
          }
        : {}),
      ...(entry.evaluations ? { evaluations: entry.evaluations } : {}),
      ...(entry.fingerprintHistory
        ? {
            fingerprintHistory: entry.fingerprintHistory.map((h) => ({
              findingId: String(h.findingId ?? ''),
              runId: String(h.runId ?? ''),
              scenarioId: String(h.scenarioId ?? ''),
              severity: String(h.severity ?? ''),
              reviewStatus: String(h.reviewStatus ?? 'open'),
              createdAt: String(h.createdAt ?? ''),
            })),
          }
        : {}),
      reportsDir: config.reportsDir,
    });

    const classified = await classifyFinding(input, client, { model });
    const goldenVerdict = entry.goldenVerdict;
    predicted.push(classified.output.verdict);
    goldenLabels.push(goldenVerdict);

    if (!classified.output.requiresHumanReview) {
      console.error(`${entry.id}: requiresHumanReview !== true`);
      return 1;
    }

    detail.push({
      id: entry.id,
      golden: goldenVerdict,
      predicted: classified.output.verdict,
      ok: classified.output.verdict === goldenVerdict,
      output: classified.output,
    });
  }

  const correct = detail.filter((d) => d.ok).length;
  const total = detail.length;
  const accuracy = total === 0 ? 0 : correct / total;
  const matrix = confusionMatrix(predicted, goldenLabels);
  const f1 = macroF1(matrix);
  const signalTotal = goldenLabels.filter((g) => g === 'signal').length;
  const signalCorrect = detail.filter((d) => d.golden === 'signal' && d.ok).length;
  const signalRecall = signalTotal === 0 ? 1 : signalCorrect / signalTotal;

  const reportPath = join(process.cwd(), 'reports/evolution/evolab-sprint11-judge-gate.md');
  writeGateReport({
    path: reportPath,
    accuracy,
    correct,
    total,
    matrix,
    macroF1: f1,
    signalRecall,
    results: detail,
  });

  if (opts.json) {
    console.log(
      JSON.stringify(
        { accuracy, correct, total, macroF1: f1, signalRecall, matrix, detail },
        null,
        2,
      ),
    );
  } else {
    console.log('EPIS2 Evolab — judge eval (Sprint 11 gate)\n');
    console.log(`  Accuracy: ${(accuracy * 100).toFixed(1)}% (${correct}/${total})`);
    console.log(`  Macro-F1: ${f1.toFixed(3)}`);
    console.log(`  Signal recall: ${(signalRecall * 100).toFixed(1)}%`);
    console.log(`  Reporte: ${reportPath}`);
  }

  return accuracy >= 0.8 ? 0 : 1;
}
