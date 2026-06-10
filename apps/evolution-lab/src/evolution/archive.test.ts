import { describe, expect, it } from 'vitest';
import { ScenarioDefinitionSchema, type ScenarioDefinition } from '../contracts/schemas.js';
import {
  decideElite,
  minimalFitness,
  scoreFitness,
  type ArchiveEntry,
  type CandidateFitness,
} from './archive.js';
import { assignNiche, emptyNiches, enumerateNiches, nicheKey } from './niches.js';

function makeScenario(id: string, overrides: Partial<ScenarioDefinition> = {}): ScenarioDefinition {
  return ScenarioDefinitionSchema.parse({
    id,
    version: 1,
    name: id,
    risk: 'medium',
    target: { capabilities: ['draft_lifecycle'] },
    persona: { role: 'physician' },
    fixture: { type: 'synthetic-draft-lifecycle', demoCaseCode: 'DEMO-002' },
    goal: { action: 'test' },
    steps: ['login'],
    flow: [
      { login: { label: 'login_physician' } },
      {
        api: {
          label: 'draft_create',
          method: 'POST',
          path: '/api/drafts',
          body: { patientId: '{patientId}' },
        },
      },
    ],
    expected: { actionBlocked: false },
    evaluators: ['functional'],
    ...overrides,
  });
}

function baseEntry(overrides: Partial<ArchiveEntry> = {}): ArchiveEntry {
  const scenario = makeScenario('elite-001');
  const fitness: CandidateFitness = {
    endpointsCovered: ['POST /api/drafts'],
    auditEventsCovered: [],
    newEndpoints: 1,
    newAuditEvents: 0,
    findingsCount: 0,
    durationMs: 5000,
    novelty: 0.1,
    score: 2,
    executionOk: true,
  };
  const niche = assignNiche(scenario);
  return {
    candidateId: 'elite-001',
    scenarioYaml: 'id: elite-001',
    niche,
    nicheKey: nicheKey(niche),
    fitness,
    status: 'elite',
    parentIds: [],
    generation: 0,
    ...overrides,
  };
}

describe('scoreFitness', () => {
  it('devuelve -1 si la ejecución falló', () => {
    expect(
      scoreFitness({
        newEndpoints: 5,
        newAuditEvents: 0,
        findingsCount: 0,
        novelty: 0.5,
        durationMs: 1000,
        executionOk: false,
      }),
    ).toBe(-1);
  });

  it('prioriza cobertura nueva sobre duración', () => {
    const high = scoreFitness({
      newEndpoints: 3,
      newAuditEvents: 0,
      findingsCount: 0,
      novelty: null,
      durationMs: 1000,
      executionOk: true,
    });
    const low = scoreFitness({
      newEndpoints: 0,
      newAuditEvents: 0,
      findingsCount: 0,
      novelty: null,
      durationMs: 1000,
      executionOk: true,
    });
    expect(high).toBeGreaterThan(low);
  });
});

describe('decideElite', () => {
  it('nicho vacío → nueva élite', () => {
    const candidate = baseEntry({
      candidateId: 'cand-new',
      fitness: { ...baseEntry().fitness, score: 1 },
    });
    const d = decideElite(undefined, candidate);
    expect(d.kind).toBe('new_elite');
    if (d.kind === 'new_elite') expect(d.entry.status).toBe('elite');
  });

  it('élite promoted no se reemplaza', () => {
    const current = baseEntry({
      status: 'promoted',
      fitness: { ...baseEntry().fitness, score: 1 },
    });
    const candidate = baseEntry({
      candidateId: 'cand-2',
      fitness: { ...baseEntry().fitness, score: 99 },
    });
    const d = decideElite(current, candidate);
    expect(d.kind).toBe('kept_candidate');
    if (d.kind === 'kept_candidate') expect(d.entry.status).toBe('candidate');
  });

  it('fitness estrictamente mejor desplaza élite', () => {
    const current = baseEntry({ fitness: { ...baseEntry().fitness, score: 2 } });
    const candidate = baseEntry({
      candidateId: 'cand-better',
      fitness: { ...baseEntry().fitness, score: 5 },
    });
    const d = decideElite(current, candidate);
    expect(d.kind).toBe('replaces_elite');
    if (d.kind === 'replaces_elite') {
      expect(d.entry.status).toBe('elite');
      expect(d.displaced.status).toBe('discarded');
      expect(d.displaced.discardReason).toContain('cand-better');
    }
  });

  it('fitness igual o peor queda candidate', () => {
    const current = baseEntry({ fitness: { ...baseEntry().fitness, score: 5 } });
    const candidate = baseEntry({
      candidateId: 'cand-worse',
      fitness: { ...baseEntry().fitness, score: 3 },
    });
    expect(decideElite(current, candidate).kind).toBe('kept_candidate');
    const equal = baseEntry({
      candidateId: 'cand-eq',
      fitness: { ...baseEntry().fitness, score: 5 },
    });
    expect(decideElite(current, equal).kind).toBe('kept_candidate');
  });
});

describe('minimalFitness', () => {
  it('marca executionOk false y score -1', () => {
    const f = minimalFitness('timeout');
    expect(f.executionOk).toBe(false);
    expect(f.score).toBe(-1);
    expect(f.failureReason).toBe('timeout');
  });
});

describe('niches', () => {
  it('enumera 45 celdas', () => {
    expect(enumerateNiches()).toHaveLength(45);
  });

  it('emptyNiches excluye corpus ocupado', () => {
    const corpus = [
      makeScenario('s1', { persona: { role: 'nurse' }, expected: { actionBlocked: true } }),
    ];
    const empty = emptyNiches(corpus);
    expect(empty.length).toBeLessThan(45);
    expect(empty.some((n) => nicheKey(n) === nicheKey(assignNiche(corpus[0]!)))).toBe(false);
  });
});
