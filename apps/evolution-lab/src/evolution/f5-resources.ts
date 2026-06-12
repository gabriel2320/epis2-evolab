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
  warnSystemUsedPercent: number;
};

export const DEFAULT_F5_RESOURCE_LIMITS: F5ResourceLimits = {
  maxSystemUsedPercent: 92,
  minFreeMemMb: 2048,
  maxCombinedRssMb: 14_000,
  maxGpuMemPercent: 92,
  warnSystemUsedPercent: 85,
};

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

  if (snapshot.gpu && snapshot.gpu.usedPercent >= limits.maxGpuMemPercent) {
    bump(
      'critical',
      `VRAM GPU ${snapshot.gpu.usedPercent.toFixed(1)}% (≥${limits.maxGpuMemPercent}%)`,
    );
  } else if (snapshot.gpu && snapshot.gpu.usedPercent >= limits.maxGpuMemPercent * 0.85) {
    bump('warn', `VRAM GPU ${snapshot.gpu.usedPercent.toFixed(1)}% (aviso)`);
  }

  const cooldownSec = level === 'critical' ? 120 : level === 'warn' ? 30 : 0;
  return { level, reasons, cooldownSec };
}
