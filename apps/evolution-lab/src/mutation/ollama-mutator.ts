import { createLogger } from '../logger.js';

const log = createLogger('mutation-ollama');

/**
 * JSON schema laxo del escenario pasado en `format` de /api/chat (spec §2.5).
 * Deliberadamente genérico en `flow`: la gramática de llama.cpp no maneja
 * uniones discriminadas profundas. La validación estricta ocurre después en
 * 3 capas (Zod real + semántica + dry-run) en validate.ts.
 *
 * Desviación de la spec: `target` y `fixture` se añadieron a `required` — con
 * format constrained decoding los modelos omiten las propiedades no requeridas:
 * sin `target` el 100% fallaba Zod, y sin `fixture` se pierde el contexto base
 * de placeholders (patientId/encounterId vía demoCaseCode).
 */
export const SCENARIO_FORMAT_SCHEMA = {
  type: 'object',
  required: [
    'id',
    'version',
    'name',
    'risk',
    'target',
    'persona',
    'fixture',
    'goal',
    'steps',
    'flow',
    'expected',
    'evaluators',
  ],
  properties: {
    id: { type: 'string' },
    version: { type: 'integer' },
    name: { type: 'string' },
    description: { type: 'string' },
    risk: { type: 'string', enum: ['low', 'medium', 'high'] },
    target: {
      type: 'object',
      required: ['capabilities'],
      properties: { capabilities: { type: 'array', items: { type: 'string' } } },
    },
    persona: {
      type: 'object',
      required: ['role'],
      properties: { role: { type: 'string' } },
    },
    fixture: { type: 'object' },
    goal: { type: 'object', required: ['action'] },
    steps: { type: 'array', items: { type: 'string' } },
    flow: { type: 'array', items: { type: 'object' } },
    expected: { type: 'object' },
    evaluators: { type: 'array', items: { type: 'string' } },
    actionObservation: { type: 'string' },
    timeoutMs: { type: 'integer' },
    maxAttempts: { type: 'integer' },
    tags: { type: 'array', items: { type: 'string' } },
  },
} as const;

export type MutationGenerationRequest = {
  model: string;
  system: string;
  user: string;
  temperature: number;
  seed: number;
};

export type MutationGenerationResult =
  | { ok: true; data: unknown; raw: string; durationMs: number }
  | { ok: false; error: string; raw: string; durationMs: number };

/**
 * Cliente de mutación desacoplado del transporte — SIEMPRE mockeado en tests.
 * La implementación real llama a Ollama /api/chat con `format` (JSON schema).
 */
export type ScenarioMutationClient = {
  generate(req: MutationGenerationRequest): Promise<MutationGenerationResult>;
};

function tryParseJson(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as unknown;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

export function createOllamaScenarioMutationClient(opts: {
  baseUrl: string;
  timeoutMs?: number;
  keepAlive?: string;
  numCtx?: number;
  numPredict?: number;
}): ScenarioMutationClient {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const keepAlive = opts.keepAlive ?? '3m';
  const numCtx = opts.numCtx ?? 8192;
  const numPredict = opts.numPredict ?? 4096;

  return {
    async generate(req: MutationGenerationRequest): Promise<MutationGenerationResult> {
      const started = Date.now();
      try {
        const res = await fetch(`${opts.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: req.model,
            messages: [
              { role: 'system', content: req.system },
              { role: 'user', content: req.user },
            ],
            stream: false,
            format: SCENARIO_FORMAT_SCHEMA,
            keep_alive: keepAlive,
            options: {
              num_ctx: numCtx,
              num_predict: numPredict,
              temperature: req.temperature,
              seed: req.seed,
            },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const durationMs = Date.now() - started;
        if (!res.ok) {
          return { ok: false, error: `Ollama HTTP ${res.status}`, raw: '', durationMs };
        }
        const body = (await res.json()) as { message?: { content?: string } };
        const raw = body.message?.content ?? '';
        const data = tryParseJson(raw);
        if (data === undefined) {
          return { ok: false, error: 'Respuesta no es JSON parseable', raw, durationMs };
        }
        return { ok: true, data, raw, durationMs };
      } catch (err) {
        const durationMs = Date.now() - started;
        const message = err instanceof Error ? err.message : String(err);
        log.warn('Generación de mutación falló', { model: req.model, error: message });
        return { ok: false, error: message, raw: '', durationMs };
      }
    },
  };
}
