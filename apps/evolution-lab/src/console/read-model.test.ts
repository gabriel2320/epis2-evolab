import { describe, expect, it } from 'vitest';
import { listScenarios } from '../scenarios/loader.js';

describe('console read-model', () => {
  it('dashboard scenarios incluye llm-command-evolution-001', () => {
    const scenarios = listScenarios();
    expect(scenarios.some((s) => s.id === 'llm-command-evolution-001')).toBe(true);
  });
});
