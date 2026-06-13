import { describe, expect, it } from 'vitest';
import { DEV_PLAN_FOCUS_NICHE_KEYS } from './vram-governor.js';
import { parseNicheKey } from '../evolution/niches.js';
import { DEV_PLAN_F5_RESOURCE_LIMITS, evaluateResourceHealth } from '../evolution/f5-resources.js';

describe('vram-governor dev-plan', () => {
  it('focus niches son válidos MAP-Elites', () => {
    for (const key of DEV_PLAN_FOCUS_NICHE_KEYS) {
      expect(parseNicheKey(key)).toBeDefined();
    }
  });

  it('dev-plan limits son más estrictos que default', () => {
    expect(DEV_PLAN_F5_RESOURCE_LIMITS.maxGpuMemPercent).toBeLessThan(92);
    expect(DEV_PLAN_F5_RESOURCE_LIMITS.maxGpuMemMb).toBe(9600);
  });

  it('critical por VRAM absoluta MB', () => {
    const h = evaluateResourceHealth(
      {
        ts: new Date().toISOString(),
        system: { totalMemMb: 32_000, freeMemMb: 8_000, usedPercent: 70 },
        processes: [],
        evolabRssMb: 800,
        ollamaRssMb: 4000,
        ollama: { up: true, modelCount: 1, loadedModels: [] },
        gpu: { usedMemMb: 9800, totalMemMb: 12_288, usedPercent: 75 },
      },
      DEV_PLAN_F5_RESOURCE_LIMITS,
    );
    expect(h.level).toBe('critical');
    expect(h.reasons.some((r) => r.includes('9600'))).toBe(true);
  });
});
