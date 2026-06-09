import { describe, expect, it } from 'vitest';
import { MarSafetyEvaluator } from './mar-safety.js';

const runId = '00000000-0000-4000-8000-000000000077';

describe('MarSafetyEvaluator', () => {
  it('detecta hallazgo si MAR aprobado con dosis held', () => {
    const ev = new MarSafetyEvaluator();
    const result = ev.evaluate({
      runId,
      scenarioId: 'suspended-medication-mar-001',
      expected: { administrationBlocked: true, warningVisible: true },
      observations: [
        {
          kind: 'fixture_prep',
          label: 'mar_dose_held',
          payload: { held: true },
        },
        {
          kind: 'api_response',
          label: 'mar_approve_attempt',
          payload: { status: 200, ok: true },
        },
      ],
    });
    expect(result.passed).toBe(false);
    expect(result.severity).toBe('critical');
  });
});
