import { loadEvolabConfig } from '../config/env.js';
import { pingEvolabDatabase } from '../persistence/client.js';
import {
  countOpenFindingsByJudgeVerdict,
  listJudgeQueueFromDb,
  listOpenFindingsForJudge,
  updateFindingJudgeVerdict,
} from '../persistence/judge-repository.js';
import { buildJudgeInputFromDb } from '../judge/build-input.js';
import {
  createOllamaJudgeClient,
  DEFAULT_JUDGE_MODEL,
  JUDGE_PROMPT_VERSION,
} from '../judge/ollama-judge-client.js';
import { classifyFinding } from '../judge/triage-judge.js';
import type { JudgeTriageOutput } from '../judge/schemas.js';
import { recordBanditReward } from '../bandit/repository.js';

export type JudgeTriageRunResult = {
  findingId: string;
  verdict: string;
  priority: number;
  model: string;
  source: string;
  persisted: boolean;
  output: JudgeTriageOutput;
};

export async function runJudgeTriage(opts: {
  findingId?: string;
  dryRun?: boolean;
  refresh?: boolean;
  json?: boolean;
  mock?: boolean;
  model?: string;
}): Promise<number> {
  const config = loadEvolabConfig();
  if (!config.databaseUrl || !(await pingEvolabDatabase(config.databaseUrl))) {
    console.error('review --judge requiere EPIS2_EVOLAB_DATABASE_URL y npm run evolab:db:migrate');
    return 1;
  }

  const findings = await listOpenFindingsForJudge(config.databaseUrl, {
    ...(opts.findingId ? { findingId: opts.findingId } : {}),
    ...(opts.refresh ? { refresh: true } : {}),
    promptVersion: JUDGE_PROMPT_VERSION,
  });

  if (findings.length === 0) {
    if (opts.json) {
      console.log(
        JSON.stringify({ judged: [], message: 'Sin findings open para juzgar' }, null, 2),
      );
    } else {
      console.log('Sin findings open para juzgar.');
    }
    return 0;
  }

  const client = opts.mock
    ? {
        classify: async () => ({
          ok: true as const,
          output: {
            verdict: 'signal' as const,
            confidence: 0.8,
            rationale: 'Mock',
            requiresHumanReview: true as const,
            suggestedPriority: 20,
          },
          raw: '{}',
          durationMs: 0,
          model: 'mock',
        }),
      }
    : createOllamaJudgeClient({ baseUrl: config.ollamaUrl });

  const model = opts.model ?? DEFAULT_JUDGE_MODEL;
  const results: JudgeTriageRunResult[] = [];

  for (const finding of findings) {
    const input = await buildJudgeInputFromDb({
      databaseUrl: config.databaseUrl,
      findingId: finding.id,
      reportsDir: config.reportsDir,
    });
    if (!input) continue;

    try {
      const classified = await classifyFinding(input, client, { model });
      if (!opts.dryRun) {
        await updateFindingJudgeVerdict(config.databaseUrl, finding.id, {
          verdict: classified.output.verdict,
          confidence: classified.output.confidence,
          rationale: classified.output.rationale,
          model: classified.model,
          promptVersion: classified.promptVersion,
          priority: classified.output.suggestedPriority ?? 50,
        });

        if (classified.source === 'llm' && !opts.mock) {
          const reward = classified.output.confidence;
          await recordBanditReward(config.databaseUrl, {
            taskType: 'judge_triage',
            modelName: classified.model,
            reward,
            context: { findingId: finding.id, promptVersion: classified.promptVersion },
          });
        }
      }

      results.push({
        findingId: finding.id,
        verdict: classified.output.verdict,
        priority: classified.output.suggestedPriority ?? 50,
        model: classified.model,
        source: classified.source,
        persisted: !opts.dryRun,
        output: classified.output,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${finding.id}: ${message}`);
    }
  }

  if (opts.json) {
    console.log(JSON.stringify({ judged: results, dryRun: !!opts.dryRun }, null, 2));
    return results.length > 0 ? 0 : 1;
  }

  const queue = await listJudgeQueueFromDb(config.databaseUrl, 50);
  const counts = await countOpenFindingsByJudgeVerdict(config.databaseUrl);

  console.log('EPIS2 Evolab — cola de revisión (judge pre-clasificado)\n');
  for (const f of queue) {
    const tag = (f.judgeVerdict ?? 'PENDING').toUpperCase();
    console.log(
      `  [${tag}]  P=${f.judgePriority ?? '—'}   ${f.id.slice(0, 8)}…  ${f.severity}  ${f.scenarioId}  ${f.category}`,
    );
    if (f.judgeRationale) {
      console.log(`            ${f.judgeRationale.slice(0, 120)}`);
    }
    console.log(`            ${f.title.slice(0, 100)}`);
    console.log('');
  }

  console.log(
    `Total open: ${counts.total} | signal: ${counts.signal} | duplicate: ${counts.duplicate} | noise: ${counts.noise} | sin judge: ${counts.unjudged}`,
  );
  console.log('⚠ Todos requieren revisión humana. El judge solo ordena — no cierra.');
  if (opts.dryRun) {
    console.log(`\n(dry-run: ${results.length} clasificados sin persistir)`);
  }

  return 0;
}
