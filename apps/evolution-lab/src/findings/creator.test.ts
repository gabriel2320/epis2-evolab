import { describe, expect, it } from 'vitest';
import { createFindingsFromEvaluations } from './creator.js';

describe('createFindingsFromEvaluations', () => {
  it('genera finding para evaluación fallida', () => {
    const findings = createFindingsFromEvaluations({
      runId: '00000000-0000-4000-8000-000000000001',
      scenarioId: 'discharge-critical-pending-001',
      targetEnvironmentId: 'epis2-local-sandbox',
      evaluations: [
        {
          runId: '00000000-0000-4000-8000-000000000001',
          evaluatorId: 'clinical_safety',
          passed: false,
          severity: 'critical',
          message: 'Alta aprobada con crítico pendiente',
        },
      ],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.category).toBe('clinical_safety');
    expect(findings[0]?.recommendedAction).toBe('generate_test');
    expect(findings[0]?.fingerprint).toHaveLength(16);
  });
});
