import { describe, expect, it } from 'vitest';
import { resolveSeedForStrategy } from './regenerate.js';

describe('regenerate', () => {
  it('exact conserva el seed original', () => {
    expect(resolveSeedForStrategy('exact', 'seed-abc')).toBe('seed-abc');
  });

  it('new-seed genera un UUID distinto', () => {
    const next = resolveSeedForStrategy('new-seed', 'seed-abc');
    expect(next).not.toBe('seed-abc');
    expect(next).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
