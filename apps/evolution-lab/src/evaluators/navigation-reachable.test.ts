import { describe, expect, it, beforeEach } from 'vitest';
import { NavigationReachableEvaluator } from './navigation-reachable.js';
import { resetProcessTreeCache } from '../process-tree/catalog.js';

describe('navigation_reachable evaluator', () => {
  beforeEach(() => resetProcessTreeCache());

  it('pasa con ruta comando en árbol', () => {
    const ev = new NavigationReachableEvaluator();
    const result = ev.evaluate({
      runId: '00000000-0000-4000-8000-000000000001',
      scenarioId: 'test',
      expected: {},
      observations: [],
      processNodeId: 'command-home',
      browserOpens: ['/comando'],
    });
    expect(result.passed).toBe(true);
  });

  it('falla con ruta inventada', () => {
    const ev = new NavigationReachableEvaluator();
    const result = ev.evaluate({
      runId: '00000000-0000-4000-8000-000000000001',
      scenarioId: 'test',
      expected: {},
      observations: [],
      browserOpens: ['/ruta/inexistente/evolab'],
    });
    expect(result.passed).toBe(false);
  });
});
