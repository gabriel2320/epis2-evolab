import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import type { ScenarioDefinition } from '../contracts/schemas.js';
import {
  computeScenarioNovelty,
  createInMemoryEmbeddingCache,
  type EmbeddingCache,
  type EmbeddingsClient,
} from '../fitness/novelty.js';
import { createLogger } from '../logger.js';
import { isApiStep, isBrowserStep, isCustomStep, isLoginStep } from '../step-engine/schema.js';
import { availablePlaceholdersAfter, stepLabel } from './flow-context.js';
import type { ScenarioMutationClient } from './ollama-mutator.js';
import {
  buildRepairPrompt,
  PROMPT_VERSION,
  REPAIR_TEMPERATURE,
  type MutationOperator,
  type MutationOperatorName,
  type MutationTask,
} from './operators.js';
import { isRepairable, validateCandidate, type ValidationResult } from './validate.js';

const log = createLogger('mutation-pipeline');

export const DEFAULT_NOVELTY_THRESHOLD = 0.005;

export type DiscardReason =
  | 'generation_failed'
  | 'invalid_unrepairable'
  | 'invalid_after_repair'
  | 'repair_failed'
  | 'duplicate'
  | 'low_novelty'
  | 'no_compatible_parents';

/** Telemetría por candidato (spec §2.7: descartes registrados con errores). */
export type CandidateRecord = {
  index: number;
  operator: MutationOperatorName;
  model: string;
  parentIds: string[];
  seed: number;
  promptVersion: string;
  attempts: number;
  repaired: boolean;
  validDirect: boolean;
  validFinal: boolean;
  status: 'accepted' | 'discarded';
  discardReason?: DiscardReason;
  issues: string[];
  scenarioId?: string;
  candidatePath?: string;
  novelty?: number | null;
  durationMs: number;
};

export type MutationPipelineResult = {
  records: CandidateRecord[];
  acceptedPaths: string[];
  noveltyAvailable: boolean;
  totalDurationMs: number;
};

export type MutationPipelineOptions = {
  count: number;
  operators: MutationOperator[];
  corpus: ScenarioDefinition[];
  client: ScenarioMutationClient;
  /** Directorio de candidatos — NUNCA scenarios/ (sin revisión humana no hay corpus). */
  outputDir: string;
  repairModel: string;
  runSeed?: string;
  seedScenarioId?: string;
  /** Índice base para buildTask (variar inputs entre generaciones S9). */
  startIndex?: number;
  noveltyThreshold?: number;
  /** null ⇒ solo dedup estructural (Ollama embeddings no disponible). */
  embeddings?: EmbeddingsClient | null;
  embeddingCache?: EmbeddingCache;
};

function fnvSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function sortedDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortedDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * Hash estructural para dedup exacto (spec §3 capa 4): flow normalizado sin
 * labels + rol + goal + expected. Variantes que solo difieren en id/name/labels
 * son duplicados.
 */
export function structuralHash(scenario: ScenarioDefinition): string {
  const flow = (scenario.flow ?? []).map((step) => {
    if (isApiStep(step)) {
      return {
        t: 'api',
        m: step.api.method,
        p: step.api.path,
        b: sortedDeep(step.api.body ?? null),
        c: Object.keys(step.api.capture ?? {}).sort(),
      };
    }
    if (isBrowserStep(step)) return { t: 'browser', open: step.browser.open ?? null };
    if (isCustomStep(step)) return { t: 'custom', n: step.custom.name };
    if (isLoginStep(step)) return { t: 'login' };
    return { t: 'wait' };
  });
  const normalized = {
    role: scenario.persona.role,
    goal: scenario.goal.action,
    flow,
    expected: sortedDeep(scenario.expected),
  };
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function shortOperator(name: MutationOperatorName): string {
  return { role_swap: 'rs', payload_perturbation: 'pp', step_injection: 'si', crossover: 'cx' }[
    name
  ];
}

function apiStepsWithBody(scenario: ScenarioDefinition) {
  return (scenario.flow ?? []).filter(isApiStep).filter((s) => s.api.body);
}

function apiStepsWithCapture(scenario: ScenarioDefinition) {
  return (scenario.flow ?? []).filter(isApiStep).filter((s) => s.api.capture);
}

function fixtureType(scenario: ScenarioDefinition): string | undefined {
  const type = scenario.fixture?.type;
  return typeof type === 'string' ? type : undefined;
}

function compatibleParents(
  corpus: ScenarioDefinition[],
): Array<[ScenarioDefinition, ScenarioDefinition]> {
  const pairs: Array<[ScenarioDefinition, ScenarioDefinition]> = [];
  for (let i = 0; i < corpus.length; i += 1) {
    for (let j = 0; j < corpus.length; j += 1) {
      if (i === j) continue;
      const a = corpus[i]!;
      const b = corpus[j]!;
      const sameFixture = fixtureType(a) !== undefined && fixtureType(a) === fixtureType(b);
      const sharedCapability = a.target.capabilities.some((c) => b.target.capabilities.includes(c));
      if (sameFixture || sharedCapability) pairs.push([a, b]);
    }
  }
  return pairs;
}

const PERTURBATION_KINDS = ['campo_faltante', 'valor_invalido', 'id_inexistente'] as const;

/**
 * Deriva determinísticamente la tarea de mutación i-ésima: padre, parámetros
 * del operador (campo objetivo, punto de inserción, padres del crossover) e id
 * prescrito. Variar el input — no solo el seed — evita variantes convergentes (R4).
 */
export function buildTask(
  operator: MutationOperator,
  corpus: ScenarioDefinition[],
  index: number,
  seedScenarioId?: string,
): MutationTask | undefined {
  const parents = seedScenarioId ? corpus.filter((s) => s.id === seedScenarioId) : corpus;
  if (parents.length === 0) return undefined;

  const baseId = (parent: ScenarioDefinition): string =>
    `${parent.id}-m8${shortOperator(operator.name)}-${String(index + 1).padStart(3, '0')}`;

  if (operator.name === 'role_swap') {
    const parent = parents[index % parents.length]!;
    const targets = ['physician', 'nurse', 'admin'].filter((r) => r !== parent.persona.role);
    const targetRole = targets[index % targets.length]!;
    return {
      operator: operator.name,
      parent,
      variantId: baseId(parent),
      params: { targetRole },
      index,
    };
  }

  if (operator.name === 'payload_perturbation') {
    const candidates = parents.filter((p) => apiStepsWithBody(p).length > 0);
    if (candidates.length === 0) return undefined;
    const parent = candidates[index % candidates.length]!;
    const steps = apiStepsWithBody(parent);
    const step = steps[index % steps.length]!;
    const fields = Object.keys(step.api.body ?? {});
    const targetField = fields[index % Math.max(fields.length, 1)] ?? '';
    const perturbationKind = PERTURBATION_KINDS[index % PERTURBATION_KINDS.length]!;
    return {
      operator: operator.name,
      parent,
      variantId: baseId(parent),
      params: { targetLabel: step.api.label, targetField, perturbationKind },
      index,
    };
  }

  if (operator.name === 'step_injection') {
    const candidates = parents.filter((p) => apiStepsWithCapture(p).length > 0);
    if (candidates.length === 0) return undefined;
    const parent = candidates[index % candidates.length]!;
    const steps = apiStepsWithCapture(parent);
    const afterLabel = steps[index % steps.length]!.api.label;
    return {
      operator: operator.name,
      parent,
      variantId: baseId(parent),
      params: {
        afterLabel,
        intent: 'verificar el recurso recién creado/modificado consultándolo con GET',
        availablePlaceholders: availablePlaceholdersAfter(parent, afterLabel).join(', '),
      },
      index,
    };
  }

  // crossover
  const pool = seedScenarioId
    ? compatibleParents(corpus).filter(([a]) => a.id === seedScenarioId)
    : compatibleParents(corpus);
  if (pool.length === 0) return undefined;
  const [parentA, parentB] = pool[index % pool.length]!;
  const cutSteps = apiStepsWithCapture(parentA);
  const cutA =
    cutSteps.length > 0
      ? cutSteps[cutSteps.length - 1]!.api.label
      : stepLabel((parentA.flow ?? [])[0]!, 0);
  const flowB = parentB.flow ?? [];
  const firstNonLoginB = flowB.findIndex((s) => !isLoginStep(s));
  const cutB = stepLabel(flowB[Math.max(firstNonLoginB, 0)]!, Math.max(firstNonLoginB, 0));
  return {
    operator: operator.name,
    parent: parentA,
    secondParent: parentB,
    variantId: baseId(parentA),
    params: { cutA, cutB },
    index,
  };
}

function uniqueCandidatePath(outputDir: string, scenarioId: string): string {
  let path = join(outputDir, `${scenarioId}.yaml`);
  let suffix = 2;
  while (existsSync(path)) {
    path = join(outputDir, `${scenarioId}-${suffix}.yaml`);
    suffix += 1;
  }
  return path;
}

/**
 * Pipeline S8.4: generación → validación 3 capas → 1 reparación 14b →
 * dedup estructural + novedad bge-m3 → YAML en scenarios/candidates/.
 * Lotes ordenados por modelo (amplitud primero) para minimizar swaps de VRAM.
 */
export async function runMutationPipeline(
  options: MutationPipelineOptions,
): Promise<MutationPipelineResult> {
  const started = Date.now();
  const noveltyThreshold = options.noveltyThreshold ?? DEFAULT_NOVELTY_THRESHOLD;
  const embeddingCache = options.embeddingCache ?? createInMemoryEmbeddingCache();
  const corpusIds = new Set(options.corpus.map((s) => s.id));
  const corpusHashes = new Set(options.corpus.map(structuralHash));
  const sessionHashes = new Set<string>();
  const records: CandidateRecord[] = [];
  const acceptedPaths: string[] = [];
  let noveltyAvailable = options.embeddings != null;

  // Tareas con orden de lote por modelo: amplitud (7b) primero, profundidad después.
  const tasks: Array<{ operator: MutationOperator; task: MutationTask }> = [];
  const startIndex = options.startIndex ?? 0;
  for (let i = 0; i < options.count; i += 1) {
    const operator = options.operators[(startIndex + i) % options.operators.length]!;
    const task = buildTask(operator, options.corpus, startIndex + i, options.seedScenarioId);
    if (!task) {
      records.push({
        index: i,
        operator: operator.name,
        model: operator.model,
        parentIds: [],
        seed: 0,
        promptVersion: PROMPT_VERSION,
        attempts: 0,
        repaired: false,
        validDirect: false,
        validFinal: false,
        status: 'discarded',
        discardReason: 'no_compatible_parents',
        issues: ['Sin padres compatibles para el operador'],
        durationMs: 0,
      });
      continue;
    }
    tasks.push({ operator, task });
  }
  const depthModel = options.repairModel;
  tasks.sort((a, b) => {
    const rank = (model: string): number => (model === depthModel ? 1 : 0);
    return rank(a.operator.model) - rank(b.operator.model) || a.task.index - b.task.index;
  });

  type Pending = {
    operator: MutationOperator;
    task: MutationTask;
    result: ValidationResult;
    candidate: unknown;
    repaired: boolean;
    attempts: number;
    validDirect: boolean;
    durationMs: number;
  };
  const pendingRepair: Pending[] = [];
  const finished: Pending[] = [];

  // Fase 1 — generación (lote por modelo).
  for (const { operator, task } of tasks) {
    const seed = fnvSeed(`${options.runSeed ?? 'evolab'}:${task.index}:${operator.name}`);
    const prompt = operator.buildPrompt(task);
    const generation = await options.client.generate({
      model: operator.model,
      system: prompt.system,
      user: prompt.user,
      temperature: operator.temperature,
      seed,
    });
    if (!generation.ok) {
      records.push({
        index: task.index,
        operator: operator.name,
        model: operator.model,
        parentIds: [task.parent.id, ...(task.secondParent ? [task.secondParent.id] : [])],
        seed,
        promptVersion: PROMPT_VERSION,
        attempts: 1,
        repaired: false,
        validDirect: false,
        validFinal: false,
        status: 'discarded',
        discardReason: 'generation_failed',
        issues: [generation.error],
        durationMs: generation.durationMs,
      });
      continue;
    }
    const result = validateCandidate(generation.data, { corpusIds, task });
    const pending: Pending = {
      operator,
      task,
      result,
      candidate: generation.data,
      repaired: false,
      attempts: 1,
      validDirect: result.valid,
      durationMs: generation.durationMs,
    };
    if (!result.valid && isRepairable(result)) {
      pendingRepair.push(pending);
    } else {
      finished.push(pending);
    }
  }

  // Fase 2 — reparación (lote 14b, 1 intento máx., errores literales — spec §2.7).
  for (const pending of pendingRepair) {
    const errors = pending.result.valid ? [] : pending.result.issues.map((i) => i.message);
    const seed = fnvSeed(`${options.runSeed ?? 'evolab'}:${pending.task.index}:repair`);
    const prompt = buildRepairPrompt(pending.candidate, errors);
    const repair = await options.client.generate({
      model: options.repairModel,
      system: prompt.system,
      user: prompt.user,
      temperature: REPAIR_TEMPERATURE,
      seed,
    });
    pending.attempts += 1;
    if (repair.ok) {
      const result = validateCandidate(repair.data, { corpusIds, task: pending.task });
      pending.durationMs += repair.durationMs;
      if (result.valid) {
        pending.result = result;
        pending.candidate = repair.data;
        pending.repaired = true;
      } else {
        pending.result = result;
      }
    } else {
      pending.durationMs += repair.durationMs;
      pending.result = {
        valid: false,
        issues: [
          { layer: 'semantic', message: `Reparación falló: ${repair.error}`, repairable: false },
        ],
      };
    }
    finished.push(pending);
  }

  // Fase 3 — dedup + novedad + persistencia de candidatos aceptados.
  mkdirSync(options.outputDir, { recursive: true });
  finished.sort((a, b) => a.task.index - b.task.index);
  for (const pending of finished) {
    const { operator, task } = pending;
    const parentIds = [task.parent.id, ...(task.secondParent ? [task.secondParent.id] : [])];
    const seed = fnvSeed(`${options.runSeed ?? 'evolab'}:${task.index}:${operator.name}`);
    const base: CandidateRecord = {
      index: task.index,
      operator: operator.name,
      model: pending.repaired ? options.repairModel : operator.model,
      parentIds,
      seed,
      promptVersion: PROMPT_VERSION,
      attempts: pending.attempts,
      repaired: pending.repaired,
      validDirect: pending.validDirect,
      validFinal: pending.result.valid,
      status: 'discarded',
      issues: pending.result.valid ? [] : pending.result.issues.map((i) => i.message),
      durationMs: pending.durationMs,
    };

    if (!pending.result.valid) {
      records.push({
        ...base,
        discardReason: pending.attempts > 1 ? 'invalid_after_repair' : 'invalid_unrepairable',
      });
      continue;
    }

    const scenario = pending.result.scenario;
    // Invariante EPIS2: requiresHumanReview se hereda/endurece, nunca se relaja.
    const inheritedReview =
      task.parent.requiresHumanReview === true ||
      task.secondParent?.requiresHumanReview === true ||
      scenario.requiresHumanReview === true;
    const candidate: ScenarioDefinition = inheritedReview
      ? { ...scenario, requiresHumanReview: true }
      : scenario;

    const hash = structuralHash(candidate);
    if (corpusHashes.has(hash) || sessionHashes.has(hash)) {
      records.push({ ...base, scenarioId: candidate.id, discardReason: 'duplicate' });
      continue;
    }

    let novelty: number | null = null;
    if (options.embeddings) {
      novelty = await computeScenarioNovelty(
        candidate,
        options.corpus,
        options.embeddings,
        embeddingCache,
      );
      if (novelty === null) {
        if (noveltyAvailable) {
          log.warn('Embeddings no disponibles — dedup solo estructural (sin novedad bge-m3)');
        }
        noveltyAvailable = false;
      } else if (novelty < noveltyThreshold) {
        records.push({
          ...base,
          scenarioId: candidate.id,
          novelty,
          discardReason: 'low_novelty',
          issues: [`novelty ${novelty.toFixed(4)} < umbral ${noveltyThreshold}`],
        });
        continue;
      }
    } else {
      noveltyAvailable = false;
    }

    sessionHashes.add(hash);
    const candidatePath = uniqueCandidatePath(options.outputDir, candidate.id);
    writeFileSync(candidatePath, stringifyYaml(candidate), 'utf8');
    acceptedPaths.push(candidatePath);
    records.push({
      ...base,
      status: 'accepted',
      scenarioId: candidate.id,
      candidatePath,
      novelty,
    });
  }

  records.sort((a, b) => a.index - b.index);
  return {
    records,
    acceptedPaths,
    noveltyAvailable,
    totalDurationMs: Date.now() - started,
  };
}
