import { getEvolabSql } from './client.js';

export type FindingDetailRow = {
  id: string;
  runId: string;
  scenarioId: string;
  targetEnvironmentId: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  title: string;
  expectedResult: string;
  actualResult: string;
  fingerprint: string;
  recommendedAction: string;
  affectedComponents: string[];
  reviewStatus: 'open' | 'approved' | 'rejected' | 'duplicate';
  judgeVerdict: string | null;
  judgeAt: string | null;
  judgePromptVersion: string | null;
  judgePriority: number | null;
};

export type JudgeQueueRow = FindingDetailRow & {
  judgeConfidence: number | null;
  judgeRationale: string | null;
};

function mapFindingRow(row: Record<string, unknown>): FindingDetailRow {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    scenarioId: String(row.scenario_id),
    targetEnvironmentId: String(row.target_environment_id),
    category: String(row.category),
    severity: row.severity as FindingDetailRow['severity'],
    confidence: Number(row.confidence),
    title: String(row.title),
    expectedResult: String(row.expected_result),
    actualResult: String(row.actual_result),
    fingerprint: String(row.fingerprint),
    recommendedAction: String(row.recommended_action),
    affectedComponents: (row.affected_components as string[]) ?? [],
    reviewStatus: row.review_status as FindingDetailRow['reviewStatus'],
    judgeVerdict: row.judge_verdict != null ? String(row.judge_verdict) : null,
    judgeAt: row.judge_at instanceof Date ? row.judge_at.toISOString() : null,
    judgePromptVersion: row.judge_prompt_version != null ? String(row.judge_prompt_version) : null,
    judgePriority: row.judge_priority != null ? Number(row.judge_priority) : null,
  };
}

export async function getFindingDetailFromDb(
  databaseUrl: string,
  findingId: string,
): Promise<FindingDetailRow | null> {
  const sql = getEvolabSql(databaseUrl);
  const rows = await sql`SELECT * FROM evolution.findings WHERE id = ${findingId} LIMIT 1`;
  if (rows.length === 0) return null;
  return mapFindingRow(rows[0] as Record<string, unknown>);
}

export async function listOpenFindingsForJudge(
  databaseUrl: string,
  opts: { findingId?: string; refresh?: boolean; promptVersion?: string } = {},
): Promise<FindingDetailRow[]> {
  const sql = getEvolabSql(databaseUrl);
  const promptVersion = opts.promptVersion ?? 'judge-triage-v1';

  if (opts.findingId) {
    const row = await getFindingDetailFromDb(databaseUrl, opts.findingId);
    return row && row.reviewStatus === 'open' ? [row] : [];
  }

  const rows = opts.refresh
    ? await sql`
        SELECT * FROM evolution.findings
        WHERE review_status = 'open'
        ORDER BY created_at ASC
      `
    : await sql`
        SELECT * FROM evolution.findings
        WHERE review_status = 'open'
          AND (judge_at IS NULL OR judge_prompt_version IS DISTINCT FROM ${promptVersion})
        ORDER BY created_at ASC
      `;

  return rows.map((r) => mapFindingRow(r as Record<string, unknown>));
}

export async function listFingerprintHistoryFromDb(
  databaseUrl: string,
  fingerprint: string,
  excludeFindingId?: string,
  limit = 10,
): Promise<
  Array<{
    findingId: string;
    runId: string;
    scenarioId: string;
    severity: string;
    reviewStatus: string;
    createdAt: string;
  }>
> {
  const sql = getEvolabSql(databaseUrl);
  const rows = await sql<
    {
      id: string;
      run_id: string;
      scenario_id: string;
      severity: string;
      review_status: string;
      created_at: Date;
    }[]
  >`
    SELECT id, run_id, scenario_id, severity, review_status, created_at
    FROM evolution.findings
    WHERE fingerprint = ${fingerprint}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  return rows
    .filter((r) => r.id !== excludeFindingId)
    .map((r) => ({
      findingId: r.id,
      runId: r.run_id,
      scenarioId: r.scenario_id,
      severity: r.severity,
      reviewStatus: r.review_status,
      createdAt: r.created_at.toISOString(),
    }));
}

export async function listRunEvaluationsFromDb(
  databaseUrl: string,
  runId: string,
): Promise<
  Array<{
    evaluatorId: string;
    passed: boolean;
    severity?: string;
    message: string;
    details?: Record<string, unknown>;
  }>
> {
  const sql = getEvolabSql(databaseUrl);
  const rows = await sql<
    {
      evaluator_id: string;
      passed: boolean;
      severity: string | null;
      message: string;
      details: Record<string, unknown> | null;
    }[]
  >`
    SELECT evaluator_id, passed, severity, message, details
    FROM evolution.evaluations
    WHERE run_id = ${runId}
    ORDER BY created_at
  `;

  return rows.map((r) => ({
    evaluatorId: r.evaluator_id,
    passed: r.passed,
    ...(r.severity ? { severity: r.severity } : {}),
    message: r.message,
    ...(r.details ? { details: r.details } : {}),
  }));
}

export async function updateFindingJudgeVerdict(
  databaseUrl: string,
  findingId: string,
  input: {
    verdict: string;
    confidence: number;
    rationale: string;
    model: string;
    promptVersion: string;
    priority: number;
  },
): Promise<void> {
  const sql = getEvolabSql(databaseUrl);
  await sql`
    UPDATE evolution.findings
    SET
      judge_verdict = ${input.verdict},
      judge_confidence = ${input.confidence},
      judge_rationale = ${input.rationale},
      judge_model = ${input.model},
      judge_prompt_version = ${input.promptVersion},
      judge_at = NOW(),
      judge_priority = ${input.priority}
    WHERE id = ${findingId}
      AND review_status = 'open'
  `;
}

export async function listJudgeQueueFromDb(
  databaseUrl: string,
  limit = 50,
): Promise<JudgeQueueRow[]> {
  const sql = getEvolabSql(databaseUrl);
  const rows = await sql`
    SELECT *
    FROM evolution.findings
    WHERE review_status = 'open'
    ORDER BY
      CASE judge_verdict WHEN 'signal' THEN 0 WHEN 'duplicate' THEN 1 ELSE 2 END,
      judge_priority ASC NULLS LAST,
      CASE severity
        WHEN 'critical' THEN 0
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        ELSE 3
      END,
      created_at ASC
    LIMIT ${limit}
  `;

  return rows.map((r) => {
    const base = mapFindingRow(r as Record<string, unknown>);
    const row = r as Record<string, unknown>;
    return {
      ...base,
      judgeConfidence: row.judge_confidence != null ? Number(row.judge_confidence) : null,
      judgeRationale: row.judge_rationale != null ? String(row.judge_rationale) : null,
    };
  });
}

export async function countOpenFindingsByJudgeVerdict(
  databaseUrl: string,
): Promise<{ total: number; signal: number; duplicate: number; noise: number; unjudged: number }> {
  const sql = getEvolabSql(databaseUrl);
  const rows = await sql<{ judge_verdict: string | null; cnt: number }[]>`
    SELECT judge_verdict, COUNT(*)::int AS cnt
    FROM evolution.findings
    WHERE review_status = 'open'
    GROUP BY judge_verdict
  `;

  let total = 0;
  let signal = 0;
  let duplicate = 0;
  let noise = 0;
  let unjudged = 0;

  for (const r of rows) {
    total += r.cnt;
    if (r.judge_verdict === 'signal') signal += r.cnt;
    else if (r.judge_verdict === 'duplicate') duplicate += r.cnt;
    else if (r.judge_verdict === 'noise') noise += r.cnt;
    else unjudged += r.cnt;
  }

  return { total, signal, duplicate, noise, unjudged };
}
