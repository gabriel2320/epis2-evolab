import { describe, expect, it } from 'vitest';
import { buildF5Progress, terminalProgressBar } from './f5-progress.js';

describe('f5-progress', () => {
  it('calcula porcentajes de presupuesto, generaciones y gate', () => {
    const p = buildF5Progress({
      runState: {
        runId: 'f5-test',
        status: 'running',
        elapsedMinutes: 180,
        lastGenerationsCompleted: 18,
        newElitesInEmpty: 2,
        attempts: 1,
      },
      overrides: { budgetMinutes: 360, generationsTotal: 36, phase: 'evolve' },
    });
    expect(p?.budgetPercent).toBe(50);
    expect(p?.generationsPercent).toBe(50);
    expect(p?.gatePercent).toBe(40);
  });

  it('terminalProgressBar renderiza bloques', () => {
    expect(terminalProgressBar(50, 10)).toBe('█████░░░░░');
    expect(terminalProgressBar(0, 4)).toBe('░░░░');
    expect(terminalProgressBar(100, 4)).toBe('████');
  });
});
