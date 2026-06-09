import { describe, expect, it } from 'vitest';
import { resetCriticalPendingAcknowledgement } from './sandbox-prep.js';

describe('resetCriticalPendingAcknowledgement', () => {
  it('rechaza id no UUID', () => {
    const result = resetCriticalPendingAcknowledgement('not-a-uuid');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('inválido');
  });
});
