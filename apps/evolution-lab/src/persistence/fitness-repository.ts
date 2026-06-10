import type { JSONValue } from 'postgres';
import { getEvolabSql } from './client.js';

export type ScenarioFitnessInput = {
  scenarioId: string;
  runId: string;
  endpointsCovered: string[];
  auditEventsCovered: string[];
  findingsCount: number;
  durationMs: number;
  novelty: number | null;
};

export type ScenarioFitnessRow = ScenarioFitnessInput & { createdAt: string };

export async function insertScenarioFitness(
  databaseUrl: string,
  input: ScenarioFitnessInput,
): Promise<void> {
  const sql = getEvolabSql(databaseUrl);
  await sql`
    INSERT INTO evolution.scenario_fitness (
      scenario_id, run_id, endpoints_covered, audit_events_covered,
      findings_count, duration_ms, novelty
    ) VALUES (
      ${input.scenarioId},
      ${input.runId},
      ${sql.json(input.endpointsCovered as unknown as JSONValue)},
      ${sql.json(input.auditEventsCovered as unknown as JSONValue)},
      ${input.findingsCount},
      ${input.durationMs},
      ${input.novelty}
    )
  `;
}

/** Última fila de fitness por escenario (para enriquecer `fitness report`). */
export async function listLatestScenarioFitness(
  databaseUrl: string,
): Promise<ScenarioFitnessRow[]> {
  const sql = getEvolabSql(databaseUrl);
  const rows = await sql<
    {
      scenario_id: string;
      run_id: string;
      endpoints_covered: string[];
      audit_events_covered: string[];
      findings_count: number;
      duration_ms: number;
      novelty: number | null;
      created_at: Date;
    }[]
  >`
    SELECT DISTINCT ON (scenario_id)
      scenario_id, run_id, endpoints_covered, audit_events_covered,
      findings_count, duration_ms, novelty, created_at
    FROM evolution.scenario_fitness
    ORDER BY scenario_id, created_at DESC
  `;
  return rows.map((r) => ({
    scenarioId: r.scenario_id,
    runId: r.run_id,
    endpointsCovered: Array.isArray(r.endpoints_covered) ? r.endpoints_covered : [],
    auditEventsCovered: Array.isArray(r.audit_events_covered) ? r.audit_events_covered : [],
    findingsCount: r.findings_count,
    durationMs: r.duration_ms,
    novelty: r.novelty,
    createdAt: r.created_at.toISOString(),
  }));
}
