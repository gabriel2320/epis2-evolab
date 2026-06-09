import { describe, expect, it } from 'vitest';
import { computeFindingFingerprint } from './fingerprint.js';

describe('finding fingerprint', () => {
  it('es determinista para mismos inputs', () => {
    const input = {
      scenarioId: 'discharge-critical-pending-001',
      targetEnvironmentId: 'epis2-local-sandbox',
      route: '/espacio/alta',
      action: 'sign_discharge',
      expectedState: 'blocked',
      actualState: 'allowed',
      findingCategory: 'clinical_safety',
    };
    const a = computeFindingFingerprint(input);
    const b = computeFindingFingerprint(input);
    expect(a).toBe(b);
    expect(a).toHaveLength(16);
  });

  it('normaliza espacios y mayúsculas', () => {
    const a = computeFindingFingerprint({
      scenarioId: 'Test-Scenario',
      targetEnvironmentId: 'epis2-local-sandbox',
      expectedState: 'Blocked',
      actualState: 'allowed',
    });
    const b = computeFindingFingerprint({
      scenarioId: 'test-scenario',
      targetEnvironmentId: 'epis2-local-sandbox',
      expectedState: 'blocked',
      actualState: 'allowed',
    });
    expect(a).toBe(b);
  });

  it('difiere cuando cambia categoría', () => {
    const base = {
      scenarioId: 's1',
      targetEnvironmentId: 'epis2-local-sandbox',
    };
    const a = computeFindingFingerprint({ ...base, findingCategory: 'clinical_safety' });
    const b = computeFindingFingerprint({ ...base, findingCategory: 'rbac' });
    expect(a).not.toBe(b);
  });
});
