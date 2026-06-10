import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { ScenarioDefinition } from '../contracts/schemas.js';
import { createLogger } from '../logger.js';
import { isApiStep, isBrowserStep, isCustomStep, isLoginStep } from '../step-engine/schema.js';

const log = createLogger('fitness-novelty');

export const DEFAULT_EMBEDDING_MODEL = 'bge-m3';
export const DEFAULT_EMBEDDING_CACHE_PATH = 'reports/evolution/fitness/embedding-cache.json';

/**
 * Cliente de embeddings desacoplable (mockeable en tests). `embed` devuelve
 * null ante cualquier fallo (Ollama caído, modelo ausente, timeout): la
 * novedad degrada a null sin romper el run.
 */
export type EmbeddingsClient = {
  model: string;
  embed(texts: string[]): Promise<number[][] | null>;
};

export function createOllamaEmbeddingsClient(opts: {
  baseUrl: string;
  model?: string;
  timeoutMs?: number;
}): EmbeddingsClient {
  const model = opts.model ?? DEFAULT_EMBEDDING_MODEL;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  return {
    model,
    async embed(texts: string[]): Promise<number[][] | null> {
      try {
        const res = await fetch(`${opts.baseUrl}/api/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, input: texts }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
          log.warn('Ollama embed no disponible', { status: res.status, model });
          return null;
        }
        const body = (await res.json()) as { embeddings?: number[][] };
        if (!Array.isArray(body.embeddings) || body.embeddings.length !== texts.length) {
          log.warn('Respuesta de embeddings inválida', { model });
          return null;
        }
        return body.embeddings;
      } catch (err) {
        log.warn('Ollama embed falló — novelty degradada a null', {
          model,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    },
  };
}

/**
 * Serialización canónica de un escenario para embeddings: id, descripción,
 * rol, pasos del flow y expected. Determinista (claves ordenadas) para que el
 * cache por hash sea estable.
 */
export function canonicalScenarioText(scenario: ScenarioDefinition): string {
  const lines: string[] = [
    `id: ${scenario.id}`,
    `name: ${scenario.name}`,
    `description: ${scenario.description ?? ''}`,
    `role: ${scenario.persona.role}`,
    `goal: ${scenario.goal.action}`,
    `tags: ${(scenario.tags ?? []).slice().sort().join(', ')}`,
  ];
  for (const step of scenario.flow ?? []) {
    if (isLoginStep(step)) lines.push('step: login');
    else if (isApiStep(step)) lines.push(`step: api ${step.api.method} ${step.api.path}`);
    else if (isBrowserStep(step)) lines.push(`step: browser ${step.browser.open ?? ''}`.trim());
    else if (isCustomStep(step)) lines.push(`step: custom ${step.custom.name}`);
    else lines.push('step: wait');
  }
  const expectedKeys = Object.keys(scenario.expected).sort();
  for (const key of expectedKeys) {
    lines.push(`expected.${key}: ${JSON.stringify(scenario.expected[key])}`);
  }
  return lines.join('\n');
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function cosineDistance(a: number[], b: number[]): number {
  return 1 - cosineSimilarity(a, b);
}

export type EmbeddingCache = {
  get(key: string): number[] | undefined;
  set(key: string, vector: number[]): void;
  flush(): void;
};

export function createInMemoryEmbeddingCache(): EmbeddingCache {
  const store = new Map<string, number[]>();
  return {
    get: (key) => store.get(key),
    set: (key, vector) => void store.set(key, vector),
    flush: () => undefined,
  };
}

/** Cache de embeddings en disco (JSON) para no recomputar el corpus completo. */
export function createFileEmbeddingCache(path = DEFAULT_EMBEDDING_CACHE_PATH): EmbeddingCache {
  const absolute = resolve(process.cwd(), path);
  let store: Record<string, number[]> = {};
  if (existsSync(absolute)) {
    try {
      store = JSON.parse(readFileSync(absolute, 'utf8')) as Record<string, number[]>;
    } catch {
      store = {};
    }
  }
  return {
    get: (key) => store[key],
    set: (key, vector) => {
      store[key] = vector;
    },
    flush: () => {
      try {
        mkdirSync(dirname(absolute), { recursive: true });
        writeFileSync(absolute, JSON.stringify(store));
      } catch (err) {
        log.warn('No se pudo escribir cache de embeddings', {
          path: absolute,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function embeddingCacheKey(model: string, text: string): string {
  return createHash('sha256').update(`${model}\n${text}`).digest('hex');
}

async function resolveEmbeddings(
  scenarios: ScenarioDefinition[],
  client: EmbeddingsClient,
  cache: EmbeddingCache,
): Promise<Map<string, number[]> | null> {
  const byScenario = new Map<string, number[]>();
  const pending: Array<{ scenarioId: string; key: string; text: string }> = [];

  for (const scenario of scenarios) {
    const text = canonicalScenarioText(scenario);
    const key = embeddingCacheKey(client.model, text);
    const cached = cache.get(key);
    if (cached) {
      byScenario.set(scenario.id, cached);
    } else {
      pending.push({ scenarioId: scenario.id, key, text });
    }
  }

  if (pending.length > 0) {
    const embeddings = await client.embed(pending.map((p) => p.text));
    if (embeddings === null) return null;
    for (const [i, item] of pending.entries()) {
      const vector = embeddings[i];
      if (!vector) return null;
      cache.set(item.key, vector);
      byScenario.set(item.scenarioId, vector);
    }
    cache.flush();
  }

  return byScenario;
}

/**
 * Novedad por escenario (S7.4): distancia coseno mínima del embedding del
 * escenario contra el resto del corpus. null si Ollama no está disponible o
 * el corpus tiene menos de 2 escenarios — nunca lanza.
 */
export async function computeCorpusNovelty(
  scenarios: ScenarioDefinition[],
  client: EmbeddingsClient,
  cache: EmbeddingCache = createInMemoryEmbeddingCache(),
): Promise<Map<string, number | null>> {
  const novelty = new Map<string, number | null>();
  for (const scenario of scenarios) {
    novelty.set(scenario.id, null);
  }
  if (scenarios.length < 2) return novelty;

  const embeddings = await resolveEmbeddings(scenarios, client, cache);
  if (embeddings === null) return novelty;

  for (const scenario of scenarios) {
    const own = embeddings.get(scenario.id);
    if (!own) continue;
    let min = Number.POSITIVE_INFINITY;
    for (const other of scenarios) {
      if (other.id === scenario.id) continue;
      const otherVector = embeddings.get(other.id);
      if (!otherVector) continue;
      const distance = cosineDistance(own, otherVector);
      if (distance < min) min = distance;
    }
    novelty.set(scenario.id, Number.isFinite(min) ? min : null);
  }
  return novelty;
}

/** Novedad de un solo escenario contra el corpus (uso en persistencia por run). */
export async function computeScenarioNovelty(
  scenario: ScenarioDefinition,
  corpus: ScenarioDefinition[],
  client: EmbeddingsClient,
  cache: EmbeddingCache = createInMemoryEmbeddingCache(),
): Promise<number | null> {
  const all = corpus.some((s) => s.id === scenario.id) ? corpus : [...corpus, scenario];
  const novelty = await computeCorpusNovelty(all, client, cache);
  return novelty.get(scenario.id) ?? null;
}
