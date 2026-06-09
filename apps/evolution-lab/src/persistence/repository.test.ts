import { describe, expect, it } from 'vitest';
import { computeFindingFingerprint } from '../findings/fingerprint.js';

describe('persistence contracts', () => {
  it('fingerprint estable para deduplicación de hallazgos', () => {
    const a = computeFindingFingerprint({
      scenarioId: 'discharge-critical-pending-001',
      targetEnvironmentId: 'epis2-local-sandbox',
      findingCategory: 'clinical_safety',
      component: 'clinical_safety',
      expectedState: 'passed',
      actualState: 'Alta aprobada con crítico pendiente',
    });
    const b = computeFindingFingerprint({
      scenarioId: 'discharge-critical-pending-001',
      targetEnvironmentId: 'epis2-local-sandbox',
      findingCategory: 'clinical_safety',
      component: 'clinical_safety',
      expectedState: 'passed',
      actualState: 'Alta aprobada con crítico pendiente',
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(16);
  });
});
