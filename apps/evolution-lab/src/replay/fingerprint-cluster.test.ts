import { describe, it, expect } from 'vitest';
import { baseScenarioId } from './fingerprint-cluster.js';

describe('baseScenarioId', () => {
  it('elimina sufijos mutante MAP-Elites', () => {
    expect(baseScenarioId('admission-discharge-001-m8cx-008-m8rs-037')).toBe(
      'admission-discharge-001',
    );
    expect(baseScenarioId('admission-discharge-001')).toBe('admission-discharge-001');
    expect(baseScenarioId('admission-double-booking-001-m8cx-004')).toBe(
      'admission-double-booking-001',
    );
  });
});
