import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  addHypothesis,
  findHypothesisByFingerprint,
  readHypotheses,
  updateHypothesis,
  hypothesisAllowsPromote,
} from './registry.js';
import { epis2PrLabel, buildTraceabilityChecklist } from './traceability.js';

describe('hypotheses registry', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'evolab-hyp-'));
    filePath = join(dir, 'hypotheses.jsonl');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('add y find por fingerprint prefix', () => {
    const h = addHypothesis(
      { fingerprint: '50df1d69aac96d12', title: 'RBAC discharge', theme: 'B', priority: 'P0' },
      filePath,
    );
    expect(h.id).toMatch(/^hyp-/);
    expect(findHypothesisByFingerprint('50df1d69', filePath)?.id).toBe(h.id);
  });

  it('update status', () => {
    const h = addHypothesis({ fingerprint: 'abc123', title: 'test' }, filePath);
    const updated = updateHypothesis(h.id, { status: 'fixed', owner: 'dev' }, filePath);
    expect(updated.status).toBe('fixed');
    expect(readHypotheses(filePath)).toHaveLength(1);
  });

  it('wontfix bloquea promote', () => {
    const h = addHypothesis({ fingerprint: 'deadbeef', title: 'x' }, filePath);
    updateHypothesis(h.id, { status: 'wontfix' }, filePath);
    const row = findHypothesisByFingerprint('deadbeef', filePath)!;
    expect(hypothesisAllowsPromote(row).ok).toBe(false);
  });
});

describe('traceability', () => {
  it('genera PR label evolab-fp-*', () => {
    expect(epis2PrLabel('50df1d69aac96d12')).toBe('evolab-fp-50df1d69aac9');
  });

  it('golden journey para P0 discharge', () => {
    const checklist = buildTraceabilityChecklist({
      id: 'hyp-b',
      fingerprint: '50df1d69aac96d12',
      title: 'RBAC discharge 403',
      status: 'open',
      owner: '',
      theme: 'B',
      priority: 'P0',
      notes: '',
      createdAt: '',
      updatedAt: '',
    });
    expect(checklist.requiresGoldenJourney).toBe(true);
    expect(checklist.items.some((i) => i.includes('golden-journey'))).toBe(true);
  });
});
