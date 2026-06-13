#!/usr/bin/env node
/**
 * Informe de hallazgos Evolab — agrega DB + cola judge para revisión humana.
 * Uso: npm run evolab:findings:report [-- --f5-run f5-1781261389000]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEvolabConfig } from '../../apps/evolution-lab/src/config/env.js';
import { pingEvolabDatabase, getEvolabSql } from '../../apps/evolution-lab/src/persistence/client.js';
import {
  countOpenFindingsByJudgeVerdict,
  listJudgeQueueFromDb,
} from '../../apps/evolution-lab/src/persistence/judge-repository.js';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const args = process.argv.slice(2);
const f5Run = argValue('--f5-run') ?? 'f5-1781261389000';
const today = new Date().toISOString().slice(0, 10);

function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

type ScenarioAgg = { scenarioId: string; total: number; signal: number; noise: number; duplicate: number; unjudged: number };
type CategoryAgg = { category: string; total: number; signal: number };

async function aggregateByScenario(databaseUrl: string): Promise<ScenarioAgg[]> {
  const sql = getEvolabSql(databaseUrl);
  const rows = await sql<
    {
      scenario_id: string;
      judge_verdict: string | null;
      cnt: number;
    }[]
  >`
    SELECT scenario_id, judge_verdict, COUNT(*)::int AS cnt
    FROM evolution.findings
    WHERE review_status = 'open'
    GROUP BY scenario_id, judge_verdict
    ORDER BY scenario_id
  `;

  const map = new Map<string, ScenarioAgg>();
  for (const r of rows) {
    let entry = map.get(r.scenario_id);
    if (!entry) {
      entry = { scenarioId: r.scenario_id, total: 0, signal: 0, noise: 0, duplicate: 0, unjudged: 0 };
      map.set(r.scenario_id, entry);
    }
    entry.total += r.cnt;
    if (r.judge_verdict === 'signal') entry.signal += r.cnt;
    else if (r.judge_verdict === 'noise') entry.noise += r.cnt;
    else if (r.judge_verdict === 'duplicate') entry.duplicate += r.cnt;
    else entry.unjudged += r.cnt;
  }
  return [...map.values()].sort((a, b) => b.signal - a.signal || b.total - a.total);
}

async function aggregateByCategory(databaseUrl: string): Promise<CategoryAgg[]> {
  const sql = getEvolabSql(databaseUrl);
  const rows = await sql<
    { category: string; judge_verdict: string | null; cnt: number }[]
  >`
    SELECT category, judge_verdict, COUNT(*)::int AS cnt
    FROM evolution.findings
    WHERE review_status = 'open'
    GROUP BY category, judge_verdict
    ORDER BY category
  `;

  const map = new Map<string, CategoryAgg>();
  for (const r of rows) {
    let entry = map.get(r.category);
    if (!entry) entry = { category: r.category, total: 0, signal: 0 };
    map.set(r.category, entry);
    entry.total += r.cnt;
    if (r.judge_verdict === 'signal') entry.signal += r.cnt;
  }
  return [...map.values()].sort((a, b) => b.signal - a.signal);
}

async function countF5SessionFindings(databaseUrl: string, runIdPrefix: string): Promise<number> {
  const sql = getEvolabSql(databaseUrl);
  const rows = await sql<{ cnt: number }[]>`
    SELECT COUNT(*)::int AS cnt
    FROM evolution.findings f
    JOIN evolution.runs r ON r.id = f.run_id
    WHERE f.review_status = 'open'
      AND r.started_at >= (
        SELECT COALESCE(MIN(started_at), NOW() - INTERVAL '1 day')
        FROM evolution.runs
        WHERE started_at >= NOW() - INTERVAL '2 days'
      )
  `;
  return rows[0]?.cnt ?? 0;
}

async function main(): Promise<void> {
  const config = loadEvolabConfig();
  if (!config.databaseUrl || !(await pingEvolabDatabase(config.databaseUrl))) {
    console.error('evolab:findings:report requiere DB migrada');
    process.exit(1);
  }

  const counts = await countOpenFindingsByJudgeVerdict(config.databaseUrl);
  const queue = await listJudgeQueueFromDb(config.databaseUrl, 100);
  const byScenario = await aggregateByScenario(config.databaseUrl);
  const byCategory = await aggregateByCategory(config.databaseUrl);
  const signalTop = queue.filter((f) => f.judgeVerdict === 'signal').slice(0, 25);
  const sessionApprox = await countF5SessionFindings(config.databaseUrl, f5Run);

  const outDir = join(ROOT, 'reports/evolution');
  mkdirSync(outDir, { recursive: true });
  const mdPath = join(outDir, `evolab-findings-report-${today}.md`);
  const jsonPath = join(outDir, `evolab-findings-report-${today}.json`);

  const payload = {
    generatedAt: new Date().toISOString(),
    f5RunId: f5Run,
    openFindings: counts,
    sessionOpenApprox: sessionApprox,
    byScenario,
    byCategory,
    signalQueue: signalTop.map((f) => ({
      id: f.id,
      scenarioId: f.scenarioId,
      severity: f.severity,
      category: f.category,
      priority: f.judgePriority,
      title: f.title,
      rationale: f.judgeRationale?.slice(0, 300) ?? null,
      fingerprint: f.fingerprint,
    })),
  };

  writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');

  const lines: string[] = [
    `# EPIS2 Evolab — Informe de hallazgos`,
    ``,
    `**Generado:** ${payload.generatedAt}`,
    `**Contexto:** post F5 extendido \`${f5Run}\``,
    ``,
    `> Judge **no cierra** \`review_status\`. Todos los open requieren decisión humana.`,
    ``,
    `---`,
    ``,
    `## Resumen cola open`,
    ``,
    `| Métrica | Count |`,
    `|---------|------:|`,
    `| **Total open** | **${counts.total}** |`,
    `| signal (judge) | ${counts.signal} |`,
    `| noise (judge) | ${counts.noise} |`,
    `| duplicate (judge) | ${counts.duplicate} |`,
    `| sin judge | ${counts.unjudged} |`,
    ``,
    `---`,
    ``,
    `## Por categoría (open)`,
    ``,
    `| Categoría | Total | Signal |`,
    `|-----------|------:|-------:|`,
    ...byCategory.map((c) => `| ${c.category} | ${c.total} | ${c.signal} |`),
    ``,
    `---`,
    ``,
    `## Por escenario (open, top signal)`,
    ``,
    `| Escenario | Total | Signal | Noise | Dup | Sin judge |`,
    `|-----------|------:|-------:|------:|----:|----------:|`,
    ...byScenario.slice(0, 20).map(
      (s) =>
        `| ${s.scenarioId} | ${s.total} | ${s.signal} | ${s.noise} | ${s.duplicate} | ${s.unjudged} |`,
    ),
    ``,
    `---`,
    ``,
    `## Top signal — revisión humana prioritaria`,
    ``,
  ];

  if (signalTop.length === 0) {
    lines.push(`_Sin hallazgos clasificados como signal._`, ``);
  } else {
    for (const f of signalTop) {
      lines.push(
        `### ${f.title}`,
        ``,
        `- **ID:** \`${f.id}\``,
        `- **Escenario:** ${f.scenarioId}`,
        `- **Severidad:** ${f.severity} · **Categoría:** ${f.category}`,
        `- **Prioridad judge:** ${f.judgePriority ?? '—'}`,
        `- **Fingerprint:** \`${f.fingerprint}\``,
        ...(f.judgeRationale
          ? [`- **Rationale:** ${f.judgeRationale.slice(0, 400)}`]
          : []),
        ``,
      );
    }
  }

  lines.push(
    `---`,
    ``,
    `## Acciones recomendadas`,
    ``,
    `1. \`npm run evolab:review -- --finding <uuid> --decision approved|rejected|duplicate\``,
    `2. Cola runs: \`npm run evolab:queue\``,
    `3. Promoción élites: \`npm run evolab:archive:promote -- --dry-run\``,
    ``,
    `JSON: \`reports/evolution/evolab-findings-report-${today}.json\``,
    ``,
  );

  writeFileSync(mdPath, lines.join('\n'), 'utf8');
  console.log(`Informe hallazgos:\n  ${mdPath}\n  ${jsonPath}`);
  console.log(
    `\nOpen: ${counts.total} | signal: ${counts.signal} | noise: ${counts.noise} | sin judge: ${counts.unjudged}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
