import { describe, it, expect } from 'vitest';
import { validateArchivePromoteGate } from './archive-promote-command.js';

describe('validateArchivePromoteGate', () => {
  it('dry-run omite gate', () => {
    expect(validateArchivePromoteGate({ dryRun: true }).ok).toBe(true);
  });

  it('signoff permite promote', () => {
    expect(validateArchivePromoteGate({ signoff: 'ok humano' }).ok).toBe(true);
  });

  it('bloquea sin hipótesis ni signoff', () => {
    expect(validateArchivePromoteGate({}).ok).toBe(false);
  });

  it('permite con hipótesis seed P0', () => {
    const gate = validateArchivePromoteGate({ hypothesisId: 'hyp-b-rbac-discharge' });
    expect(gate.ok).toBe(true);
  });
});
