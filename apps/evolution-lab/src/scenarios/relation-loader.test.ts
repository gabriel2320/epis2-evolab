import { describe, expect, it } from 'vitest';
import { loadScenario } from './loader.js';
import {
  applyScenarioOverrides,
  listRelations,
  loadRelation,
  validateRelationDryRun,
} from './relation-loader.js';

const GATE_RELATIONS = [
  'mr-census-inversion-001',
  'mr-permission-monotonicity-001',
  'mr-blocked-idempotence-001',
] as const;

describe('relation-loader', () => {
  it('lista las 3 relaciones gate S10', () => {
    const ids = listRelations()
      .map((r) => r.id)
      .sort();
    expect(ids).toEqual([...GATE_RELATIONS].sort());
  });

  for (const id of GATE_RELATIONS) {
    it(`carga ${id} con kind metamorphic`, () => {
      const relation = loadRelation(id);
      expect(relation.kind).toBe('metamorphic');
      expect(relation.verify.length).toBeGreaterThan(0);
    });

    it(`dry-run verde para ${id}`, () => {
      const relation = loadRelation(id);
      const issues = validateRelationDryRun(relation);
      expect(issues).toEqual([]);
    });
  }

  it('applyScenarioOverrides cambia rol sin mutar el base', () => {
    const base = loadScenario('role-nurse-approve-001');
    const overridden = applyScenarioOverrides(base, {
      persona: { role: 'physician' },
      expected: { actionBlocked: false },
    });
    expect(overridden.persona.role).toBe('physician');
    expect(overridden.expected.actionBlocked).toBe(false);
    expect(base.persona.role).toBe('nurse');
  });

  it('detecta escenario referenciado inexistente', () => {
    const relation = loadRelation('mr-census-inversion-001');
    const broken = {
      ...relation,
      source: { ...relation.source, scenario: 'no-existe-xyz' },
    };
    const issues = validateRelationDryRun(broken);
    expect(issues.some((i) => i.includes('no existe'))).toBe(true);
  });

  it('detecta reuseContext sin capture en source', () => {
    const relation = loadRelation('mr-blocked-idempotence-001');
    const broken = {
      ...relation,
      followUp: relation.followUp
        ? { ...relation.followUp, reuseContext: ['fantasmaId'] }
        : undefined,
    };
    const issues = validateRelationDryRun(broken);
    expect(issues.some((i) => i.includes('fantasmaId'))).toBe(true);
  });

  it('detecta label de verify inexistente en flow', () => {
    const relation = loadRelation('mr-census-inversion-001');
    const broken = {
      ...relation,
      verify: [
        {
          compare: 'snapshot_equal' as const,
          left: { run: 'source' as const, observation: 'label_inexistente' },
          right: { run: 'source' as const, observation: 'census_baseline' },
          fields: ['bedCount'],
        },
      ],
    };
    const issues = validateRelationDryRun(broken);
    expect(issues.some((i) => i.includes('label_inexistente'))).toBe(true);
  });
});
