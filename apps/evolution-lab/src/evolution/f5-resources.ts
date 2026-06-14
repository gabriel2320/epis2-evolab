import type { RunProfile } from '../gpu/run-profile.js';

export type F5ResourceLevel = 'ok' | 'warn' | 'critical';

export type F5ProcessSample = {
  name: string;
  pid: number;
  rssMb: number;
  tag: 'evolab' | 'ollama';
};

export type F5ResourceSnapshot = {
  ts: string;
  system: {
    totalMemMb: number;
    freeMemMb: number;
    usedPercent: number;
    loadAvg1?: number;
  };
  processes: F5ProcessSample[];
  evolabRssMb: number;
  ollamaRssMb: number;
  gpu?: {
    usedMemMb: number;
    totalMemMb: number;
    usedPercent: number;
    utilPercent?: number;
  };
  ollama: {
    up: boolean;
    modelCount: number;
    loadedModels: Array<{ name: string; sizeMb: number }>;
  };
};

export type F5ResourceLimits = {
  maxSystemUsedPercent: number;
  minFreeMemMb: number;
  maxCombinedRssMb: number;
  maxGpuMemPercent: number;
  /** VRAM absoluta (MB) — complementa el umbral porcentual en GPUs pequeñas (RTX 5070 12 GB). */
  maxGpuMemMb?: number;
  warnGpuMemPercent: number;
  warnSystemUsedPercent: number;
};

export const DEFAULT_F5_RESOURCE_LIMITS: F5ResourceLimits = {
  maxSystemUsedPercent: 92,
  minFreeMemMb: 2048,
  maxCombinedRssMb: 14_000,
  maxGpuMemPercent: 92,
  warnGpuMemPercent: 85,
  warnSystemUsedPercent: 85,
};

/** Perfil F5 dev-plan — VRAM conservadora para dejar margen a EPIS2 sandbox + SO. */
export const DEV_PLAN_F5_RESOURCE_LIMITS: F5ResourceLimits = {
  maxSystemUsedPercent: 88,
  minFreeMemMb: 3072,
  maxCombinedRssMb: 12_000,
  maxGpuMemPercent: 78,
  maxGpuMemMb: 9600,
  warnGpuMemPercent: 72,
  warnSystemUsedPercent: 82,
};

function envFloat(key: string): number | undefined {
  const raw = process.env[key]?.trim();
  if (!raw) return undefined;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : undefined;
}

function envInt(key: string): number | undefined {
  const raw = process.env[key]?.trim();
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Fusiona límites base con overrides de entorno (S13.3 + F5 dev-plan). */
export function resolveResourceLimitsFromEnv(
  base: F5ResourceLimits = DEFAULT_F5_RESOURCE_LIMITS,
): F5ResourceLimits {
  const maxGpuMemMb = envInt('EPIS2_EVOLAB_MAX_GPU_MEM_MB') ?? base.maxGpuMemMb;
  const limits: F5ResourceLimits = {
    maxSystemUsedPercent:
      envFloat('EPIS2_EVOLAB_MAX_SYSTEM_RAM_PERCENT') ?? base.maxSystemUsedPercent,
    minFreeMemMb: envInt('EPIS2_EVOLAB_MIN_FREE_MEM_MB') ?? base.minFreeMemMb,
    maxCombinedRssMb: envInt('EPIS2_EVOLAB_MAX_COMBINED_RSS_MB') ?? base.maxCombinedRssMb,
    maxGpuMemPercent: envFloat('EPIS2_EVOLAB_MAX_GPU_MEM_PERCENT') ?? base.maxGpuMemPercent,
    warnGpuMemPercent: envFloat('EPIS2_EVOLAB_GPU_WARN_PERCENT') ?? base.warnGpuMemPercent,
    warnSystemUsedPercent:
      envFloat('EPIS2_EVOLAB_RAM_WARN_PERCENT') ?? base.warnSystemUsedPercent,
  };
  if (maxGpuMemMb !== undefined) {
    limits.maxGpuMemMb = maxGpuMemMb;
  }
  return limits;
}

const RESOURCE_HYSTERESIS_MS = 5 * 60_000;
let lastCriticalAtMs = 0;

/** Solo tests — resetea histéresis de recursos. */
export function resetResourceHealthHysteresis(): void {
  lastCriticalAtMs = 0;
}

/** Umbrales adaptados al perfil de corrida (S13.3). */
export function resolveResourceLimitsForProfile(
  profile: RunProfile,
): F5ResourceLimits {
  let base: F5ResourceLimits;
  switch (profile) {
    case 'dev-plan':
      base = DEV_PLAN_F5_RESOURCE_LIMITS;
      break;
    case 'api-only':
      base = {
        ...DEFAULT_F5_RESOURCE_LIMITS,
        maxGpuMemPercent: 96,
        warnSystemUsedPercent: 88,
      };
      break;
    case 'visual-smoke':
      base = {
        ...DEFAULT_F5_RESOURCE_LIMITS,
        maxGpuMemPercent: 88,
        maxCombinedRssMb: 12_000,
        warnSystemUsedPercent: 82,
      };
      break;
    case 'hybrid':
    default:
      base = DEFAULT_F5_RESOURCE_LIMITS;
      break;
  }
  return resolveResourceLimitsFromEnv(base);
}

export type F5ResourceHealth = {
  level: F5ResourceLevel;
  reasons: string[];
  cooldownSec: number;
};

export function evaluateResourceHealth(
  snapshot: F5ResourceSnapshot,
  limits: F5ResourceLimits = DEFAULT_F5_RESOURCE_LIMITS,
): F5ResourceHealth {
  const reasons: string[] = [];
  let level = 'ok' as F5ResourceLevel;

  const bump = (next: F5ResourceLevel, reason: string) => {
    reasons.push(reason);
    if (next === 'critical') level = 'critical';
    else if (next === 'warn' && level === 'ok') level = 'warn';
  };

  if (snapshot.system.usedPercent >= limits.maxSystemUsedPercent) {
    bump(
      'critical',
      `RAM sistema ${snapshot.system.usedPercent.toFixed(1)}% (≥${limits.maxSystemUsedPercent}%)`,
    );
  } else if (snapshot.system.usedPercent >= limits.warnSystemUsedPercent) {
    bump(
      'warn',
      `RAM sistema ${snapshot.system.usedPercent.toFixed(1)}% (aviso ≥${limits.warnSystemUsedPercent}%)`,
    );
  }

  if (snapshot.system.freeMemMb < limits.minFreeMemMb) {
    bump(
      'critical',
      `RAM libre ${snapshot.system.freeMemMb.toFixed(0)} MB (<${limits.minFreeMemMb} MB)`,
    );
  }

  const combined = snapshot.evolabRssMb + snapshot.ollamaRssMb;
  if (combined >= limits.maxCombinedRssMb) {
    bump(
      'critical',
      `RSS evolab+ollama ${combined.toFixed(0)} MB (≥${limits.maxCombinedRssMb} MB)`,
    );
  } else if (combined >= limits.maxCombinedRssMb * 0.85) {
    bump('warn', `RSS evolab+ollama ${combined.toFixed(0)} MB (cerca del límite)`);
  }

  if (snapshot.gpu) {
    const vramPct = snapshot.gpu.usedPercent;
    const vramMb = snapshot.gpu.usedMemMb;
    if (vramPct >= limits.maxGpuMemPercent) {
      bump(
        'critical',
        `VRAM GPU ${vramPct.toFixed(1)}% (≥${limits.maxGpuMemPercent}%)`,
      );
    } else if (limits.maxGpuMemMb != null && vramMb >= limits.maxGpuMemMb) {
      bump(
        'critical',
        `VRAM GPU ${vramMb.toFixed(0)} MB (≥${limits.maxGpuMemMb} MB)`,
      );
    } else if (vramPct >= limits.warnGpuMemPercent) {
      bump('warn', `VRAM GPU ${vramPct.toFixed(1)}% (aviso ≥${limits.warnGpuMemPercent}%)`);
    } else if (
      limits.maxGpuMemMb != null &&
      vramMb >= limits.maxGpuMemMb * 0.9
    ) {
      bump('warn', `VRAM GPU ${vramMb.toFixed(0)} MB (cerca de ${limits.maxGpuMemMb} MB)`);
    }
  }

  if (level === 'critical') {
    lastCriticalAtMs = Date.now();
  }

  let cooldownSec = level === 'critical' ? 120 : level === 'warn' ? 30 : 0;
  if (level !== 'critical' && lastCriticalAtMs > 0) {
    const sinceCriticalMs = Date.now() - lastCriticalAtMs;
    if (sinceCriticalMs < RESOURCE_HYSTERESIS_MS) {
      const hysteresisSec = Math.ceil((RESOURCE_HYSTERESIS_MS - sinceCriticalMs) / 1000);
      cooldownSec = Math.max(cooldownSec, hysteresisSec);
    }
  }

  return { level, reasons, cooldownSec };
}
