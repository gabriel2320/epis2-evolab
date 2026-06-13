import { describe, expect, it } from 'vitest';
import { ScenarioDefinitionSchema } from '../contracts/schemas.js';
import { computeScenarioStructuralSignature, extractBaseScenarioId } from './fingerprint-structural.js';
import {
  countOpenSignalHits,
  shouldSkipSandboxRun,
  type FingerprintLedger,
} from './fingerprint-ledger.js';

function makeScenario(id: string) {
  return ScenarioDefinitionSchema.parse({
    id,
    version: 1,
    name: id,
    risk: 'medium',
    target: { capabilities: ['draft_lifecycle'] },
    persona: { role: 'physician' },
    fixture: { type: 'synthetic-draft-lifecycle', demoCaseCode: 'DEMO-002' },
    goal: { action: 'discharge' },
    steps: ['login'],
    flow: [
      { login: { label: 'login_physician' } },
      {
        api: {
          label: 'discharge',
          method: 'POST',
          path: '/api/clinical/encounters/{encounterId}/discharge',
        },
      },
    ],
    expected: { actionBlocked: true },
    evaluators: ['clinical_safety', 'role_permission'],
  });
}

describe('fingerprint structural', () => {
  it('mutantes con mismo flow comparten firma estructural', () => {
    const a = makeScenario('admission-discharge-001-m8cx-008');
    const b = makeScenario('admission-discharge-001-m8cx-009');
    expect(computeScenarioStructuralSignature(a)).toBe(computeScenarioStructuralSignature(b));
  });

  it('extractBaseScenarioId quita sufijo mutante', () => {
    expect(extractBaseScenarioId('admission-discharge-001-m8cx-008')).toBe('admission-discharge-001');
  });
});

describe('shouldSkipSandboxRun', () => {
  const ledger: FingerprintLedger = {
    rows: [],
    openSignalByFingerprint: new Map([['abc', 2]]),
    openSignalByStructural: new Map([['struct1', 1]]),
    openSignalByBaseScenario: new Map([['admission-discharge-001', 5]]),
    loadedAt: new Date().toISOString(),
  };

  it('salta si firma estructural tiene signal open', () => {
    const scenario = makeScenario('x-m1-1');
    const sig = computeScenarioStructuralSignature(scenario);
    const customLedger: FingerprintLedger = {
      ...ledger,
      openSignalByStructural: new Map([[sig, 2]]),
    };
    const d = shouldSkipSandboxRun(scenario, customLedger);
    expect(d.skip).toBe(true);
    expect(d.reason).toContain('ledger_structural_signal');
  });

  it('salta mutante si base saturada', () => {
    const scenario = makeScenario('admission-discharge-001-m8cx-099');
    const d = shouldSkipSandboxRun(scenario, ledger);
    expect(d.skip).toBe(true);
    expect(d.reason).toContain('ledger_base_scenario_saturated');
  });

  it('countOpenSignalHits penaliza clusters saturados', () => {
    const scenario = makeScenario('admission-discharge-001-m8cx-099');
    expect(countOpenSignalHits(scenario, ledger)).toBeGreaterThanOrEqual(3);
  });
});
