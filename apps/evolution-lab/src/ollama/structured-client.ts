import type { ZodType } from 'zod';

export type StructuredInferenceResult<T> =
  | { ok: true; data: T; raw: string; repaired: boolean }
  | { ok: false; error: string; raw: string; fallback: T };

export class OllamaStructuredOutputClient {
  constructor(
    private readonly baseUrl: string,
    private readonly enqueue: <R>(fn: () => Promise<R>, signal?: AbortSignal) => Promise<R>,
  ) {}

  async inferStructured<T>(
    model: string,
    prompt: string,
    schema: ZodType<T>,
    fallback: T,
    signal?: AbortSignal,
  ): Promise<StructuredInferenceResult<T>> {
    return this.enqueue(async () => {
      const init: RequestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          format: 'json',
        }),
      };
      if (signal) init.signal = signal;
      const res = await fetch(`${this.baseUrl}/api/generate`, init);
      if (!res.ok) {
        return { ok: false as const, error: `HTTP ${res.status}`, raw: '', fallback };
      }
      const body = (await res.json()) as { response?: string };
      const raw = body.response ?? '';
      const parsed = this.tryParse(raw, schema);
      if (parsed.ok) {
        return { ok: true as const, data: parsed.data, raw, repaired: parsed.repaired };
      }
      const repaired = this.repairJson(raw);
      if (repaired) {
        const reparsed = this.tryParse(repaired, schema);
        if (reparsed.ok) {
          return { ok: true as const, data: reparsed.data, raw: repaired, repaired: true };
        }
      }
      return {
        ok: false as const,
        error: parsed.error ?? 'JSON inválido',
        raw,
        fallback,
      };
    }, signal);
  }

  private tryParse<T>(
    raw: string,
    schema: ZodType<T>,
  ): { ok: true; data: T; repaired: boolean } | { ok: false; error: string } {
    try {
      const json = JSON.parse(raw) as unknown;
      const data = schema.parse(json);
      return { ok: true, data, repaired: false };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private repairJson(raw: string): string | undefined {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return raw.slice(start, end + 1);
    }
    return undefined;
  }
}
