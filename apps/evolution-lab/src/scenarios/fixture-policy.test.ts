import { describe, expect, it } from 'vitest';
import { ScenarioDefinitionSchema, type ScenarioDefinition } from '../contracts/schemas.js';
import { scenarioNeedsFixtureReset } from './fixture-policy.js';

function makeScenario(overrides: Partial<ScenarioDefinition> = {}): ScenarioDefinition {
  return ScenarioDefinitionSchema.parse({
    id: 'test-001',
    version: 1,
    name: 'test',
    risk: 'medium',
    target: { capabilities: ['inpatient'] },
    persona: { role: 'physician' },
    goal: { action: 'x' },
    steps: ['login'],
    flow: [{ login: { label: 'login' } }],
    expected: {},
    evaluators: ['functional'],
    ...overrides,
  });
}

describe('scenarioNeedsFixtureReset (F3)', () => {
  it('criticalResultPendingAcknowledgement', () => {
    const s = makeScenario({
      fixture: { criticalResultPendingAcknowledgement: true },
    });
    expect(scenarioNeedsFixtureReset(s)).toBe(true);
  });

  it('criticalResultId sin flag explícito (mutantes MAP-Elites)', () => {
    const s = makeScenario({
      fixture: { criticalResultId: 'f0000004-0000-4000-8000-000000000002' },
    });
    expect(scenarioNeedsFixtureReset(s)).toBe(true);
  });

  it('clinical_safety + dischargeBlocked', () => {
    const s = makeScenario({
      expected: { dischargeBlocked: true },
      evaluators: ['functional', 'clinical_safety'],
    });
    expect(scenarioNeedsFixtureReset(s)).toBe(true);
  });

  it('critical_pending evaluator', () => {
    const s = makeScenario({ evaluators: ['critical_pending'] });
    expect(scenarioNeedsFixtureReset(s)).toBe(true);
  });

  it('journey physician sin crítico → no reset', () => {
    const s = makeScenario({
      fixture: { type: 'synthetic-journey', demoCaseCode: 'DEMO-001' },
    });
    expect(scenarioNeedsFixtureReset(s)).toBe(false);
  });
});
