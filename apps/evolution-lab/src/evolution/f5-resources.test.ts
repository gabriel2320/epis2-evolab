import { describe, expect, it } from 'vitest';
import {
  DEFAULT_F5_RESOURCE_LIMITS,
  evaluateResourceHealth,
  type F5ResourceSnapshot,
} from './f5-resources.js';

function snap(overrides: Partial<F5ResourceSnapshot> = {}): F5ResourceSnapshot {
  return {
    ts: new Date().toISOString(),
    system: { totalMemMb: 32_000, freeMemMb: 8_000, usedPercent: 75 },
    processes: [],
    evolabRssMb: 1200,
    ollamaRssMb: 6000,
    ollama: { up: true, modelCount: 1, loadedModels: [{ name: 'qwen2.5-coder:7b', sizeMb: 4500 }] },
    ...overrides,
  };
}

describe('f5-resources', () => {
  it('ok con métricas normales', () => {
    const h = evaluateResourceHealth(snap());
    expect(h.level).toBe('ok');
    expect(h.reasons).toHaveLength(0);
  });

  it('critical por RAM sistema alta', () => {
    const h = evaluateResourceHealth(
      snap({ system: { totalMemMb: 16_000, freeMemMb: 500, usedPercent: 96.9 } }),
    );
    expect(h.level).toBe('critical');
    expect(h.cooldownSec).toBe(120);
  });

  it('critical por VRAM GPU', () => {
    const h = evaluateResourceHealth(
      snap({ gpu: { usedMemMb: 7500, totalMemMb: 8192, usedPercent: 94 } }),
    );
    expect(h.level).toBe('critical');
  });

  it('critical por RSS combinado evolab+ollama', () => {
    const h = evaluateResourceHealth(
      snap({ evolabRssMb: 8000, ollamaRssMb: 7000 }),
      DEFAULT_F5_RESOURCE_LIMITS,
    );
    expect(h.level).toBe('critical');
  });
});
