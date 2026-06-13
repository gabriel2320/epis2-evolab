import { z } from 'zod';
import { createLogger } from '../logger.js';
import {
  DEFAULT_JUDGE_MODEL,
  JUDGE_FORMAT_SCHEMA,
  JUDGE_PROMPT_VERSION,
  JudgeTriageOutputSchema,
  type JudgeTriageOutput,
} from './schemas.js';
import { JUDGE_SYSTEM_PROMPT, buildJudgeUserPrompt } from './prompt.js';
import type { JudgeTriageInput } from './schemas.js';
import { applySuggestedPriority } from './priority.js';

const log = createLogger('judge-ollama');

export type JudgeTriageRequest = {
  model: string;
  input: JudgeTriageInput;
  temperature?: number;
};

export type JudgeTriageClient = {
  classify(
    req: JudgeTriageRequest,
  ): Promise<
    | { ok: true; output: JudgeTriageOutput; raw: string; durationMs: number; model: string }
    | { ok: false; error: string; raw: string; durationMs: number }
  >;
};

/** Normaliza JSON crudo del LLM antes de validar — prioridad la calcula applySuggestedPriority. */
export function sanitizeJudgeParsed(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const obj = { ...(parsed as Record<string, unknown>) };
  // El modelo a veces devuelve 0; el schema exige 1–100 pero la prioridad es determinista post-parse.
  delete obj.suggestedPriority;
  if (Array.isArray(obj.relatedFindingIds)) {
    const uuids = obj.relatedFindingIds.filter(
      (id) => typeof id === 'string' && z.string().uuid().safeParse(id).success,
    );
    if (uuids.length > 0) obj.relatedFindingIds = uuids;
    else delete obj.relatedFindingIds;
  }
  return obj;
}

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

export function createOllamaJudgeClient(opts: {
  baseUrl: string;
  timeoutMs?: number;
}): JudgeTriageClient {
  const timeoutMs = opts.timeoutMs ?? 120_000;

  return {
    async classify(req) {
      const started = Date.now();
      const user = buildJudgeUserPrompt(req.input);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(`${opts.baseUrl.replace(/\/$/, '')}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model: req.model,
            stream: false,
            think: false,
            options: {
              temperature: req.temperature ?? 0.1,
              num_ctx: 8192,
            },
            format: JUDGE_FORMAT_SCHEMA,
            messages: [
              { role: 'system', content: JUDGE_SYSTEM_PROMPT },
              { role: 'user', content: user },
            ],
          }),
        });

        const durationMs = Date.now() - started;
        const body = (await res.json()) as { message?: { content?: string } };
        const raw = body.message?.content ?? '';

        if (!res.ok) {
          return { ok: false, error: `HTTP ${res.status}`, raw, durationMs };
        }

        const parsed = tryParseJson(raw);
        if (!parsed) {
          return { ok: false, error: 'JSON inválido en respuesta judge', raw, durationMs };
        }

        const validated = JudgeTriageOutputSchema.safeParse(sanitizeJudgeParsed(parsed));
        if (!validated.success) {
          return {
            ok: false,
            error: `Schema judge inválido: ${validated.error.message}`,
            raw,
            durationMs,
          };
        }

        const output = applySuggestedPriority(validated.data, req.input.finding.severity);
        return { ok: true, output, raw, durationMs, model: req.model };
      } catch (err) {
        const durationMs = Date.now() - started;
        const message = err instanceof Error ? err.message : String(err);
        log.warn('Judge Ollama falló', { error: message });
        return { ok: false, error: message, raw: '', durationMs };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Mock para tests y CI — devuelve verdict fijo por finding id o golden hint. */
export function createMockJudgeClient(
  resolver: (input: JudgeTriageInput) => JudgeTriageOutput['verdict'],
): JudgeTriageClient {
  return {
    async classify(req) {
      const verdict = resolver(req.input);
      const output = applySuggestedPriority(
        {
          verdict,
          confidence: 0.85,
          rationale: `Mock judge (${verdict})`,
          requiresHumanReview: true,
        },
        req.input.finding.severity,
      );
      return {
        ok: true,
        output,
        raw: JSON.stringify(output),
        durationMs: 1,
        model: 'mock',
      };
    },
  };
}

export { DEFAULT_JUDGE_MODEL, JUDGE_PROMPT_VERSION };
