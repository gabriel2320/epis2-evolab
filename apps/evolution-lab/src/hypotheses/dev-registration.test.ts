import { describe, it, expect } from 'vitest';
import { buildDevRegistrationEntries } from './dev-registration.js';

describe('dev-registration export', () => {
  it('genera entradas de hipótesis y lab', () => {
    const entries = buildDevRegistrationEntries();
    expect(entries.length).toBeGreaterThan(8);
    expect(entries.some((e) => e.kind === 'product-hypothesis' && e.hypothesisId === 'hyp-c-audit-trail')).toBe(
      true,
    );
    expect(entries.some((e) => e.kind === 'lab-capability')).toBe(true);
  });
});
