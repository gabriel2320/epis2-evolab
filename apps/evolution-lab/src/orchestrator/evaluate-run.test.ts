import { describe, expect, it } from 'vitest';
import { loadScenario } from '../scenarios/loader.js';
import type { EvolutionRun } from '../contracts/schemas.js';
import { evaluateRun } from './evaluate-run.js';

const run: EvolutionRun = {
  id: '00000000-0000-4000-8000-000000000077',
  scenarioId: 'role-nurse-approve-001',
  scenarioVersion: 1,
  targetEnvironmentId: 'epis2-local-sandbox',
  personaId: 'nurse-intermediate',
  status: 'evaluating',
  randomSeed: 'seed-1',
};

describe('evaluateRun', () => {
  it('pasa con bloqueo 403 + auditoría presente (role-nurse-approve-001)', () => {
    const scenario = loadScenario('role-nurse-approve-001');
    const result = evaluateRun({
      run,
      scenario,
      observations: [
        {
          kind: 'api_response',
          label: 'nurse_approve_attempt',
          payload: { status: 403, ok: false },
        },
        {
          kind: 'audit_trail',
          label: 'post_run_events',
          payload: { events: [{ eventType: 'auth.login' }], eventCount: 1 },
        },
      ],
    });

    expect(result.passed).toBe(true);
    expect(result.findings).toHaveLength(0);
    expect(result.evaluations.map((e) => e.evaluatorId)).toContain('functional');
  });

  it('genera finding cuando la acción no fue bloqueada', () => {
    const scenario = loadScenario('role-nurse-approve-001');
    const result = evaluateRun({
      run,
      scenario,
      observations: [
        {
          kind: 'api_response',
          label: 'nurse_approve_attempt',
          payload: { status: 200, ok: true },
        },
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.findings.length).toBeGreaterThan(0);
  });
});
