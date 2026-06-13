import { sampleF5Resources } from '../evolution/f5-resource-sampler.js';
import type { F5ResourceSnapshot } from '../evolution/f5-resources.js';
import { createLogger } from '../logger.js';
import { resolveRunProfile, type RunProfile } from './run-profile.js';

const log = createLogger('gpu-orchestrator');

export type OllamaLoadedModel = { name: string; sizeMb: number };

export type GpuStatus = {
  profile: RunProfile;
  activeModel: string | null;
  loadedModels: OllamaLoadedModel[];
  resources: F5ResourceSnapshot;
};

let activeExclusiveModel: string | null = null;

/** Solo tests — resetea estado in-process. */
export function resetGpuOrchestratorState(): void {
  activeExclusiveModel = null;
}

export async function listLoadedOllamaModels(
  baseUrl: string,
): Promise<OllamaLoadedModel[]> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/ps`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      models?: Array<{ name: string; size_vram?: number; size?: number }>;
    };
    return (body.models ?? []).map((m) => ({
      name: m.name,
      sizeMb: ((m.size_vram ?? m.size ?? 0) as number) / (1024 * 1024),
    }));
  } catch {
    return [];
  }
}

/** Descarga un modelo de VRAM (`keep_alive: 0`). */
export async function unloadOllamaModel(baseUrl: string, model: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: '', keep_alive: 0 }),
      signal: AbortSignal.timeout(30_000),
    });
    return res.ok;
  } catch (err) {
    log.warn('unload modelo falló', {
      model,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Garantiza un único modelo en VRAM antes de chat/embed (S13.1).
 * Descarga otros modelos cargados vía Ollama /api/ps.
 */
export async function prepareExclusiveModel(baseUrl: string, model: string): Promise<void> {
  const loaded = await listLoadedOllamaModels(baseUrl);
  const others = loaded.filter((m) => m.name !== model && !model.startsWith(`${m.name}:`));
  for (const m of others) {
    log.info('Descargando modelo Ollama para liberar VRAM', { unload: m.name, target: model });
    await unloadOllamaModel(baseUrl, m.name);
  }
  activeExclusiveModel = model;
}

export async function withExclusiveModel<T>(
  baseUrl: string,
  model: string,
  fn: () => Promise<T>,
): Promise<T> {
  await prepareExclusiveModel(baseUrl, model);
  return fn();
}

export async function getGpuStatus(opts: {
  baseUrl: string;
  ollamaUrl?: string;
}): Promise<GpuStatus> {
  const ollamaUrl = opts.ollamaUrl ?? opts.baseUrl;
  const [loadedModels, resources] = await Promise.all([
    listLoadedOllamaModels(ollamaUrl),
    sampleF5Resources({ ollamaUrl }),
  ]);
  return {
    profile: resolveRunProfile(),
    activeModel: activeExclusiveModel,
    loadedModels,
    resources,
  };
}
