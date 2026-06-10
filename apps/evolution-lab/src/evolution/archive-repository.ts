import type { JSONValue } from 'postgres';
import { getEvolabSql } from '../persistence/client.js';
import { parseNicheKey, type Niche } from './niches.js';
import type { ArchiveEntry, ArchiveStatus, ArchiveStore, CandidateFitness } from './archive.js';
import { minimalFitness } from './archive.js';

/**
 * Repositorio Postgres del archivo MAP-Elites (S9.2), patrón de
 * `fitness-repository.ts`: funciones sobre `evolution.evolution_archive` y un
 * `ArchiveStore` para inyectar en el loop. Las élites desplazadas se degradan
 * a status histórico — nunca se hace DELETE.
 */

type ArchiveRow = {
  candidate_id: string;
  scenario_yaml: string;
  niche: unknown;
  niche_key: string;
  fitness: unknown;
  status: ArchiveStatus;
  discard_reason: string | null;
  parent_ids: unknown;
  operator: string | null;
  generation: number;
  run_id: string | null;
  created_at: Date;
};

function rowNiche(row: ArchiveRow): Niche {
  const parsed = parseNicheKey(row.niche_key);
  if (parsed) return parsed;
  const raw = row.niche as Partial<Niche> | null;
  return {
    role: raw?.role ?? 'physician',
    module: raw?.module ?? 'clinical',
    outcome: raw?.outcome ?? 'allowed',
  } as Niche;
}

function rowFitness(row: ArchiveRow): CandidateFitness {
  const raw = row.fitness as Partial<CandidateFitness> | null;
  if (!raw || typeof raw.score !== 'number') {
    return minimalFitness('fitness_corrupto_en_archivo');
  }
  return {
    endpointsCovered: Array.isArray(raw.endpointsCovered) ? raw.endpointsCovered : [],
    auditEventsCovered: Array.isArray(raw.auditEventsCovered) ? raw.auditEventsCovered : [],
    newEndpoints: raw.newEndpoints ?? 0,
    newAuditEvents: raw.newAuditEvents ?? 0,
    findingsCount: raw.findingsCount ?? 0,
    durationMs: raw.durationMs ?? 0,
    novelty: typeof raw.novelty === 'number' ? raw.novelty : null,
    score: raw.score,
    executionOk: raw.executionOk === true,
    ...(typeof raw.failureReason === 'string' ? { failureReason: raw.failureReason } : {}),
  };
}

function toEntry(row: ArchiveRow): ArchiveEntry {
  return {
    candidateId: row.candidate_id,
    scenarioYaml: row.scenario_yaml,
    niche: rowNiche(row),
    nicheKey: row.niche_key,
    fitness: rowFitness(row),
    status: row.status,
    ...(row.discard_reason ? { discardReason: row.discard_reason } : {}),
    parentIds: Array.isArray(row.parent_ids)
      ? (row.parent_ids as unknown[]).filter((p): p is string => typeof p === 'string')
      : [],
    ...(row.operator ? { operator: row.operator } : {}),
    generation: row.generation,
    ...(row.run_id ? { runId: row.run_id } : {}),
    createdAt: row.created_at.toISOString(),
  };
}

const COLUMNS = `candidate_id, scenario_yaml, niche, niche_key, fitness, status,
      discard_reason, parent_ids, operator, generation, run_id, created_at`;

export async function insertArchiveEntry(databaseUrl: string, entry: ArchiveEntry): Promise<void> {
  const sql = getEvolabSql(databaseUrl);
  await sql`
    INSERT INTO evolution.evolution_archive (
      candidate_id, scenario_yaml, niche, niche_key, fitness, status,
      discard_reason, parent_ids, operator, generation, run_id
    ) VALUES (
      ${entry.candidateId},
      ${entry.scenarioYaml},
      ${sql.json(entry.niche as unknown as JSONValue)},
      ${entry.nicheKey},
      ${sql.json(entry.fitness as unknown as JSONValue)},
      ${entry.status},
      ${entry.discardReason ?? null},
      ${sql.json(entry.parentIds as unknown as JSONValue)},
      ${entry.operator ?? null},
      ${entry.generation},
      ${entry.runId ?? null}
    )
  `;
}

export async function updateArchiveStatus(
  databaseUrl: string,
  candidateId: string,
  status: ArchiveStatus,
  reason?: string,
): Promise<void> {
  const sql = getEvolabSql(databaseUrl);
  await sql`
    UPDATE evolution.evolution_archive
    SET status = ${status},
        discard_reason = COALESCE(${reason ?? null}, discard_reason),
        updated_at = NOW()
    WHERE candidate_id = ${candidateId}
  `;
}

/** Élites vigentes (elite | promoted) — a lo sumo una por nicho. */
export async function listArchiveElites(databaseUrl: string): Promise<ArchiveEntry[]> {
  const sql = getEvolabSql(databaseUrl);
  const rows = await sql.unsafe<ArchiveRow[]>(`
    SELECT DISTINCT ON (niche_key) ${COLUMNS}
    FROM evolution.evolution_archive
    WHERE status IN ('elite', 'promoted')
    ORDER BY niche_key, created_at DESC
  `);
  return rows.map(toEntry);
}

export async function listArchiveByStatus(
  databaseUrl: string,
  status: ArchiveStatus,
): Promise<ArchiveEntry[]> {
  const sql = getEvolabSql(databaseUrl);
  const rows = await sql.unsafe<ArchiveRow[]>(
    `SELECT ${COLUMNS}
     FROM evolution.evolution_archive
     WHERE status = $1
     ORDER BY created_at DESC`,
    [status],
  );
  return rows.map(toEntry);
}

/** ArchiveStore Postgres para inyectar en el loop evolutivo (S9.4). */
export function createPostgresArchiveStore(databaseUrl: string): ArchiveStore {
  return {
    listElites: () => listArchiveElites(databaseUrl),
    listByStatus: (status) => listArchiveByStatus(databaseUrl, status),
    insert: (entry) => insertArchiveEntry(databaseUrl, entry),
    updateStatus: (candidateId, status, reason) =>
      updateArchiveStatus(databaseUrl, candidateId, status, reason),
  };
}
