import { describe, expect, it } from 'vitest';
import { stringify as stringifyYaml } from 'yaml';
import { ScenarioDefinitionSchema, type ScenarioDefinition } from '../contracts/schemas.js';
import { assignNiche, nicheKey } from './niches.js';
import { parentWeight, selectParents, xorshift32 } from './select-parents.js';
import type { ArchiveEntry } from './archive.js';

function scenario(id: string, role: string, blocked = false): ScenarioDefinition {
  return ScenarioDefinitionSchema.parse({
    id,
    version: 1,
    name: id,
    risk: 'low',
    target: { capabilities: ['draft_lifecycle'] },
    persona: { role },
    goal: { action: 'x' },
    steps: ['login'],
    flow: [{ login: { label: 'login' } }],
    expected: { actionBlocked: blocked },
    evaluators: ['functional'],
  });
}

describe('selectParents', () => {
  const corpus = [
    scenario('phys-allowed', 'physician', false),
    scenario('nurse-blocked', 'nurse', true),
    scenario('admin-allowed', 'admin', false),
  ];

  it('sesga hacia padres en nicho vacío', () => {
    const emptyKeys = new Set([nicheKey(assignNiche(corpus[2]!))]);
    const wEmpty = parentWeight(corpus[2]!, emptyKeys, new Set());
    const wOther = parentWeight(corpus[0]!, emptyKeys, new Set());
    expect(wEmpty).toBeGreaterThan(wOther);
  });

  it('devuelve padres distintos cuando count > 1', () => {
    const parents = selectParents({ corpus, elites: [], seed: 42, count: 2 });
    expect(parents.length).toBe(2);
    expect(parents[0]!.id).not.toBe(parents[1]!.id);
  });

  it('incluye élites en el pool de padres', () => {
    const eliteScenario = scenario('elite-x', 'nurse', true);
    const niche = assignNiche(eliteScenario);
    const elite: ArchiveEntry = {
      candidateId: 'elite-x',
      scenarioYaml: stringifyYaml(eliteScenario),
      niche,
      nicheKey: nicheKey(niche),
      fitness: {
        endpointsCovered: [],
        auditEventsCovered: [],
        newEndpoints: 0,
        newAuditEvents: 0,
        findingsCount: 0,
        durationMs: 0,
        novelty: null,
        score: 1,
        executionOk: true,
      },
      status: 'elite',
      parentIds: [],
      generation: 1,
    };
    const parents = selectParents({ corpus: [], elites: [elite], seed: 7, count: 1 });
    expect(parents).toHaveLength(1);
    expect(parents[0]!.id).toBe('elite-x');
  });
});

describe('xorshift32', () => {
  it('es determinista', () => {
    const a = xorshift32(99);
    const b = xorshift32(99);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });
});
