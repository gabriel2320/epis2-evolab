import { createLogger } from '../logger.js';
import { sampleF5Resources } from '../evolution/f5-resource-sampler.js';
import {
  evaluateResourceHealth,
  resolveResourceLimitsForProfile,
  type F5ResourceHealth,
  type F5ResourceLimits,
} from '../evolution/f5-resources.js';
import { resolveRunProfile, type RunProfile } from './run-profile.js';
import { listLoadedOllamaModels, prepareExclusiveModel } from './orchestrator.js';

const log = createLogger('vram-governor');

export type VramHeadroomResult = {
  ok: boolean;
  waitedMs: number;
  health: F5ResourceHealth;
  attempts: number;
};

export type AwaitVramHeadroomOptions = {
  ollamaUrl: string;
  model: string;
  profile?: RunProfile;
  limits?: F5ResourceLimits;
  /** Tiempo máximo de espera antes de abortar mutación/eval (default 180 s). */
  maxWaitMs?: number;
  pollMs?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Espera hasta que VRAM/RAM estén bajo umbral warn antes de cargar modelo Ollama.
 * En critical aplica cooldown y reintenta; descarga modelos huérfanos si hay target.
 */
export async function awaitVramHeadroom(
  opts: AwaitVramHeadroomOptions,
): Promise<VramHeadroomResult> {
  const profile = opts.profile ?? resolveRunProfile();
  const limits = opts.limits ?? resolveResourceLimitsForProfile(profile);
  const maxWaitMs = opts.maxWaitMs ?? 180_000;
  const pollMs = opts.pollMs ?? 5_000;
  const started = Date.now();
  let attempts = 0;
  let lastHealth: F5ResourceHealth = { level: 'ok', reasons: [], cooldownSec: 0 };

  while (Date.now() - started < maxWaitMs) {
    attempts += 1;
    const sample = await sampleF5Resources({ ollamaUrl: opts.ollamaUrl });
    lastHealth = evaluateResourceHealth(sample, limits);

    if (lastHealth.level === 'ok') {
      await prepareExclusiveModel(opts.ollamaUrl, opts.model);
      return { ok: true, waitedMs: Date.now() - started, health: lastHealth, attempts };
    }

    if (lastHealth.level === 'critical') {
      const loaded = await listLoadedOllamaModels(opts.ollamaUrl);
      if (loaded.length > 0) {
        log.info('VRAM critical — descargando modelos Ollama', {
          models: loaded.map((m) => m.name).join(', '),
          reasons: lastHealth.reasons.join(' · '),
        });
        await prepareExclusiveModel(opts.ollamaUrl, opts.model);
      }
      const waitSec = Math.max(lastHealth.cooldownSec, 30);
      log.warn(`VRAM critical — pausa ${waitSec}s`, {
        reasons: lastHealth.reasons.join(' · '),
      });
      await sleep(waitSec * 1000);
      continue;
    }

    log.info('VRAM warn — pausa breve antes de mutación', {
      reasons: lastHealth.reasons.join(' · '),
    });
    await sleep(Math.max(pollMs, lastHealth.cooldownSec * 1000));
  }

  log.error('VRAM headroom agotado — omitiendo ciclo GPU', {
    waitedMs: Date.now() - started,
    reasons: lastHealth.reasons.join(' · '),
  });
  return {
    ok: false,
    waitedMs: Date.now() - started,
    health: lastHealth,
    attempts,
  };
}

/** Nichos MAP-Elites alineados al plan EPIS2 (PROG-EXPERIENCIA-CORE + clínica base). */
export const DEV_PLAN_FOCUS_NICHE_KEYS = [
  'physician|clinical|blocked',
  'nurse|inpatient|blocked',
  'physician|inpatient|journey',
  'physician|clinical|journey',
  'physician|inpatient|blocked',
  'admin|audit|journey',
] as const;
