import type { EvaluationResult, EvolutionRun, Finding, RunStatus } from '../contracts/schemas.js';
import type { JSONValue } from 'postgres';
import { getEvolabSql } from './client.js';

export type PersistRunInput = {
  databaseUrl: string;
  run: EvolutionRun;
  evaluations: EvaluationResult[];
  findings: Finding[];
  evidenceDir: string;
  finalStatus: RunStatus | string;
};

export type RunListRow = {
  id: string;
  scenarioId: string;
  finalStatus: string;
  startedAt: string | null;
  findingCount: number;
};

export type FindingListRow = {
  id: string;
  runId: string;
  scenarioId: string;
  severity: string;
  title: string;
  fingerprint: string;
  reviewStatus: string;
  createdAt: string;
};

export async function persistRunBundle(input: PersistRunInput): Promise<void> {
  const sql = getEvolabSql(input.databaseUrl);

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO evolution.runs (
        id, scenario_id, scenario_version, target_environment_id, persona_id,
        status, random_seed, commit_sha, branch, model_name, model_profile,
        prompt_version, started_at, completed_at, configuration, evidence_dir,
        final_status, finding_count
      ) VALUES (
        ${input.run.id},
        ${input.run.scenarioId},
        ${input.run.scenarioVersion},
        ${input.run.targetEnvironmentId},
        ${input.run.personaId},
        ${input.run.status},
        ${input.run.randomSeed},
        ${input.run.commitSha ?? null},
        ${input.run.branch ?? null},
        ${input.run.modelName ?? null},
        ${input.run.modelProfile ?? null},
        ${input.run.promptVersion ?? null},
        ${input.run.startedAt ?? null},
        ${input.run.completedAt ?? null},
        ${sql.json((input.run.configuration ?? {}) as JSONValue)},
        ${input.evidenceDir},
        ${String(input.finalStatus)},
        ${input.findings.length}
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        completed_at = EXCLUDED.completed_at,
        final_status = EXCLUDED.final_status,
        finding_count = EXCLUDED.finding_count,
        evidence_dir = EXCLUDED.evidence_dir
    `;

    await tx`DELETE FROM evolution.evaluations WHERE run_id = ${input.run.id}`;
    await tx`DELETE FROM evolution.findings WHERE run_id = ${input.run.id}`;

    if (input.evaluations.length > 0) {
      for (const ev of input.evaluations) {
        await tx`
          INSERT INTO evolution.evaluations (
            run_id, evaluator_id, passed, severity, message, details
          ) VALUES (
            ${ev.runId},
            ${ev.evaluatorId},
            ${ev.passed},
            ${ev.severity ?? null},
            ${ev.message},
            ${ev.details ? sql.json(ev.details as JSONValue) : null}
          )
        `;
      }
    }

    if (input.findings.length > 0) {
      for (const f of input.findings) {
        await tx`
          INSERT INTO evolution.findings (
            run_id, scenario_id, target_environment_id, category, severity,
            confidence, title, expected_result, actual_result, reproducible,
            evidence_ids, affected_components, fingerprint, recommended_action
          ) VALUES (
            ${f.runId},
            ${f.scenarioId},
            ${f.targetEnvironmentId},
            ${f.category},
            ${f.severity},
            ${f.confidence},
            ${f.title},
            ${f.expectedResult},
            ${f.actualResult},
            ${f.reproducible},
            ${sql.json(f.evidenceIds)},
            ${sql.json(f.affectedComponents)},
            ${f.fingerprint},
            ${f.recommendedAction}
          )
        `;
      }
    }
  });
}

export async function listRunsFromDb(
  databaseUrl: string,
  limit = 10,
): Promise<RunListRow[]> {
  const sql = getEvolabSql(databaseUrl);
  const rows = await sql<
    {
      id: string;
      scenario_id: string;
      final_status: string | null;
      started_at: Date | null;
      finding_count: number;
    }[]
  >`
    SELECT id, scenario_id, final_status, started_at, finding_count
    FROM evolution.runs
    ORDER BY started_at DESC NULLS LAST, created_at DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: r.id,
    scenarioId: r.scenario_id,
    finalStatus: r.final_status ?? '?',
    startedAt: r.started_at?.toISOString() ?? null,
    findingCount: r.finding_count,
  }));
}

export async function listFindingsFromDb(
  databaseUrl: string,
  opts: { limit?: number; reviewStatus?: string } = {},
): Promise<FindingListRow[]> {
  const sql = getEvolabSql(databaseUrl);
  const limit = opts.limit ?? 20;
  const rows = opts.reviewStatus
    ? await sql<
        {
          id: string;
          run_id: string;
          scenario_id: string;
          severity: string;
          title: string;
          fingerprint: string;
          review_status: string;
          created_at: Date;
        }[]
      >`
        SELECT id, run_id, scenario_id, severity, title, fingerprint, review_status, created_at
        FROM evolution.findings
        WHERE review_status = ${opts.reviewStatus}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `
    : await sql<
        {
          id: string;
          run_id: string;
          scenario_id: string;
          severity: string;
          title: string;
          fingerprint: string;
          review_status: string;
          created_at: Date;
        }[]
      >`
        SELECT id, run_id, scenario_id, severity, title, fingerprint, review_status, created_at
        FROM evolution.findings
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;

  return rows.map((r) => ({
    id: r.id,
    runId: r.run_id,
    scenarioId: r.scenario_id,
    severity: r.severity,
    title: r.title,
    fingerprint: r.fingerprint,
    reviewStatus: r.review_status,
    createdAt: r.created_at.toISOString(),
  }));
}

export async function runExistsInDb(databaseUrl: string, runId: string): Promise<boolean> {
  const sql = getEvolabSql(databaseUrl);
  const rows = await sql`SELECT 1 FROM evolution.runs WHERE id = ${runId} LIMIT 1`;
  return rows.length > 0;
}

export async function getRunSeedFromDb(
  databaseUrl: string,
  runId: string,
): Promise<{ scenarioId: string; randomSeed: string; targetEnvironmentId?: string } | null> {
  const sql = getEvolabSql(databaseUrl);
  const rows = await sql<
    { scenario_id: string; random_seed: string; target_environment_id: string }[]
  >`SELECT scenario_id, random_seed, target_environment_id FROM evolution.runs WHERE id = ${runId} LIMIT 1`;
  if (rows.length === 0) return null;
  const row = rows[0]!;
  return {
    scenarioId: row.scenario_id,
    randomSeed: row.random_seed,
    targetEnvironmentId: row.target_environment_id,
  };
}

export async function listHumanReviewRuns(
  databaseUrl: string,
  limit = 20,
): Promise<RunListRow[]> {
  const sql = getEvolabSql(databaseUrl);
  const rows = await sql<
    {
      id: string;
      scenario_id: string;
      final_status: string | null;
      started_at: Date | null;
      finding_count: number;
    }[]
  >`
    SELECT id, scenario_id, final_status, started_at, finding_count
    FROM evolution.runs
    WHERE final_status = 'human_review'
    ORDER BY started_at DESC NULLS LAST
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: r.id,
    scenarioId: r.scenario_id,
    finalStatus: r.final_status ?? 'human_review',
    startedAt: r.started_at?.toISOString() ?? null,
    findingCount: r.finding_count,
  }));
}

export async function reviewFinding(
  databaseUrl: string,
  input: {
    findingId: string;
    decision: 'approved' | 'rejected' | 'duplicate';
    actor: string;
    comment?: string;
  },
): Promise<{ ok: boolean; message: string }> {
  const sql = getEvolabSql(databaseUrl);
  const rows = await sql<{ id: string; run_id: string; review_status: string }[]>`
    SELECT id, run_id, review_status FROM evolution.findings WHERE id = ${input.findingId} LIMIT 1
  `;
  if (rows.length === 0) {
    return { ok: false, message: `Hallazgo no encontrado: ${input.findingId}` };
  }
  const finding = rows[0]!;
  const runRows = await sql<{ final_status: string | null; status: string }[]>`
    SELECT final_status, status FROM evolution.runs WHERE id = ${finding.run_id} LIMIT 1
  `;
  const previousStatus = runRows[0]?.final_status ?? runRows[0]?.status ?? 'human_review';
  const decisionLabel =
    input.decision === 'approved'
      ? 'approve_finding'
      : input.decision === 'duplicate'
        ? 'mark_duplicate'
        : 'reject_finding';
  const newStatus =
    input.decision === 'approved'
      ? 'approved'
      : input.decision === 'duplicate'
        ? 'duplicate'
        : 'rejected';

  await sql.begin(async (tx) => {
    await tx`
      UPDATE evolution.findings
      SET review_status = ${input.decision}
      WHERE id = ${input.findingId}
    `;
    await tx`
      INSERT INTO evolution.human_decisions (
        run_id, actor, decision, comment, previous_status, new_status
      ) VALUES (
        ${finding.run_id},
        ${input.actor},
        ${decisionLabel},
        ${input.comment ?? null},
        ${previousStatus},
        ${newStatus}
      )
    `;
  });

  return { ok: true, message: `Hallazgo ${input.findingId} → ${input.decision}` };
}

export async function getRunFromDb(
  databaseUrl: string,
  runId: string,
): Promise<{
  run: Record<string, unknown>;
  evaluations: Record<string, unknown>[];
  findings: Record<string, unknown>[];
} | null> {
  const sql = getEvolabSql(databaseUrl);
  const runs = await sql`SELECT * FROM evolution.runs WHERE id = ${runId} LIMIT 1`;
  if (runs.length === 0) return null;
  const evaluations = await sql`
    SELECT * FROM evolution.evaluations WHERE run_id = ${runId} ORDER BY created_at
  `;
  const findings = await sql`
    SELECT * FROM evolution.findings WHERE run_id = ${runId} ORDER BY created_at
  `;
  return {
    run: runs[0] as Record<string, unknown>,
    evaluations: evaluations as Record<string, unknown>[],
    findings: findings as Record<string, unknown>[],
  };
}
