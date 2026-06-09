import { describe, expect, it } from 'vitest';
import { CommandResolveEvaluator, PlanFidelityEvaluator } from './plan-fidelity.js';

describe('plan evaluators', () => {
  it('plan_fidelity pasa con summary sin fallos', () => {
    const ev = new PlanFidelityEvaluator();
    const result = ev.evaluate({
      runId: 'r1',
      scenarioId: 'llm-command-evolution-001',
      expected: {},
      observations: [
        {
          kind: 'plan_execution',
          label: 'summary',
          payload: { totalSteps: 4, succeeded: 4, failed: 0 },
        },
      ],
    });
    expect(result.passed).toBe(true);
  });

  it('command_resolve exige ruta evolucion', () => {
    const ev = new CommandResolveEvaluator();
    const result = ev.evaluate({
      runId: 'r1',
      scenarioId: 'llm-command-evolution-001',
      expected: { commandResolved: true },
      observations: [
        {
          kind: 'api_response',
          label: 'command_resolve',
          payload: {
            commandResolved: true,
            routePath: '/espacio/evolucion',
            status: 200,
          },
        },
      ],
    });
    expect(result.passed).toBe(true);
  });
});
