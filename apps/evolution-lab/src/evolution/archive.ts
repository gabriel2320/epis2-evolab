import type { Niche } from './niches.js';

/**
 * Archivo MAP-Elites (S9.2): tipos, fitness multiobjetivo escalar y política
 * de reemplazo de élites. La persistencia vive en `archive-repository.ts`
 * (Postgres) y aquí hay un store en memoria para tests y dry-run.
 */

export const ARCHIVE_STATUSES = ['candidate', 'elite', 'promoted', 'discarded'] as const;
export type ArchiveStatus = (typeof ARCHIVE_STATUSES)[number];

export type CandidateFitness = {
  /** Claves `METHOD /path` cubiertas en la ejecución real. */
  endpointsCovered: string[];
  auditEventsCovered: string[];
  /** Cobertura que el baseline (corpus + élites) aún no tenía. */
  newEndpoints: number;
  newAuditEvents: number;
  findingsCount: number;
  durationMs: number;
  novelty: number | null;
  /** Escalar multiobjetivo (ver scoreFitness). */
  score: number;
  executionOk: boolean;
  failureReason?: string;
};

export type ArchiveEntry = {
  candidateId: string;
  scenarioYaml: string;
  niche: Niche;
  nicheKey: string;
  fitness: CandidateFitness;
  status: ArchiveStatus;
  discardReason?: string;
  parentIds: string[];
  operator?: string;
  generation: number;
  runId?: string;
  createdAt?: string;
};

/**
 * Fitness multiobjetivo → escalar (S9.3): prioriza cobertura nueva, luego
 * hallazgos y novedad; penaliza levemente el costo de ejecución. Pesos
 * deliberadamente simples y documentados — se calibran tras la primera
 * corrida nocturna.
 */
export function scoreFitness(input: {
  newEndpoints: number;
  newAuditEvents: number;
  findingsCount: number;
  novelty: number | null;
  durationMs: number;
  executionOk: boolean;
}): number {
  if (!input.executionOk) return -1;
  const costPenalty = (Math.min(input.durationMs, 120_000) / 60_000) * 0.25;
  return (
    2 * input.newEndpoints +
    input.newAuditEvents +
    1.5 * input.findingsCount +
    3 * (input.novelty ?? 0) -
    costPenalty
  );
}

/** Fitness mínimo para candidatos cuya ejecución falló (S9.3). */
export function minimalFitness(failureReason: string): CandidateFitness {
  return {
    endpointsCovered: [],
    auditEventsCovered: [],
    newEndpoints: 0,
    newAuditEvents: 0,
    findingsCount: 0,
    durationMs: 0,
    novelty: null,
    score: -1,
    executionOk: false,
    failureReason,
  };
}

export type EliteDecision =
  | { kind: 'new_elite'; entry: ArchiveEntry }
  | { kind: 'replaces_elite'; entry: ArchiveEntry; displaced: ArchiveEntry }
  | { kind: 'kept_candidate'; entry: ArchiveEntry };

/**
 * Política de reemplazo (S9.2):
 * - nicho vacío → el candidato es la nueva élite;
 * - élite `promoted` (decisión humana) → intocable, el candidato queda `candidate`;
 * - fitness estrictamente mejor (score >) → desplaza; la élite desplazada pasa a
 *   status histórico `discarded` con motivo `superseded_by:<id>` — nunca se borra;
 * - igual o peor → queda `candidate` (cola de revisión humana).
 *
 * El loop jamás asigna `promoted`: ese status es exclusivamente humano.
 */
export function decideElite(
  current: ArchiveEntry | undefined,
  candidate: ArchiveEntry,
): EliteDecision {
  if (!current) {
    return { kind: 'new_elite', entry: { ...candidate, status: 'elite' } };
  }
  if (current.status === 'promoted') {
    return { kind: 'kept_candidate', entry: { ...candidate, status: 'candidate' } };
  }
  if (candidate.fitness.score > current.fitness.score) {
    return {
      kind: 'replaces_elite',
      entry: { ...candidate, status: 'elite' },
      displaced: {
        ...current,
        status: 'discarded',
        discardReason: `superseded_by:${candidate.candidateId}`,
      },
    };
  }
  return { kind: 'kept_candidate', entry: { ...candidate, status: 'candidate' } };
}

/** Contrato de persistencia del archivo (Postgres o memoria). */
export type ArchiveStore = {
  /** Élites vigentes (status elite o promoted), una por nicho. */
  listElites(): Promise<ArchiveEntry[]>;
  listByStatus(status: ArchiveStatus): Promise<ArchiveEntry[]>;
  insert(entry: ArchiveEntry): Promise<void>;
  /** Actualiza status (+motivo) de una entrada existente por candidateId. */
  updateStatus(candidateId: string, status: ArchiveStatus, reason?: string): Promise<void>;
};

/** Store en memoria: tests S9.6 y `evolve --dry-run` sin DB. */
export function createInMemoryArchiveStore(seed: ArchiveEntry[] = []): ArchiveStore & {
  entries: ArchiveEntry[];
} {
  const entries: ArchiveEntry[] = seed.map((e) => ({ ...e }));
  return {
    entries,
    listElites: () =>
      Promise.resolve(entries.filter((e) => e.status === 'elite' || e.status === 'promoted')),
    listByStatus: (status) => Promise.resolve(entries.filter((e) => e.status === status)),
    insert: (entry) => {
      entries.push({ ...entry });
      return Promise.resolve();
    },
    updateStatus: (candidateId, status, reason) => {
      const entry = entries.find((e) => e.candidateId === candidateId);
      if (entry) {
        entry.status = status;
        if (reason !== undefined) entry.discardReason = reason;
      }
      return Promise.resolve();
    },
  };
}
