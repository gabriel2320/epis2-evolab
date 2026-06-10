import { describe, expect, it } from 'vitest';
import { ScenarioDefinitionSchema, type ScenarioDefinition } from '../contracts/schemas.js';
import { buildFitnessReport } from './report.js';

function makeScenario(id: string, overrides: Record<string, unknown> = {}): ScenarioDefinition {
  return ScenarioDefinitionSchema.parse({
    id,
    version: 1,
    name: `Escenario ${id}`,
    risk: 'low',
    target: { capabilities: ['demo'] },
    persona: { role: 'physician' },
    goal: { action: 'demo_action' },
    steps: ['login'],
    expected: {},
    evaluators: ['functional'],
    ...overrides,
  });
}

const draftScenario = makeScenario('test-draft-001', {
  flow: [
    { login: { label: 'login_physician' } },
    { api: { label: 'draft_create', method: 'POST', path: '/api/drafts' } },
    { api: { label: 'draft_approve', method: 'POST', path: '/api/drafts/{draftId}/approve' } },
  ],
  expected: { auditMustInclude: ['auth.login.success', 'clinical.draft.created'] },
});

const censusScenario = makeScenario('test-census-001', {
  flow: [
    { login: { label: 'login_physician' } },
    { custom: { name: 'census_snapshot', args: { label: 'census_snapshot' } } },
  ],
});

describe('buildFitnessReport', () => {
  const report = buildFitnessReport([draftScenario, censusScenario]);

  it('marca celdas cubiertas con los escenarios que las tocan', () => {
    const draftCell = report.endpointMatrix.find((c) => c.key === 'POST /api/drafts');
    expect(draftCell?.coveredBy).toEqual(['test-draft-001']);

    const approveCell = report.endpointMatrix.find(
      (c) => c.key === 'POST /api/drafts/:draftId/approve',
    );
    expect(approveCell?.coveredBy).toEqual(['test-draft-001']);

    const serviceCell = report.endpointMatrix.find((c) => c.key === 'GET /api/dashboard/service');
    expect(serviceCell?.coveredBy).toEqual(['test-census-001']);

    const loginCell = report.endpointMatrix.find((c) => c.key === 'POST /api/auth/login');
    expect(loginCell?.coveredBy).toEqual(['test-draft-001', 'test-census-001']);
  });

  it('reporta huecos para endpoints y eventos no cubiertos por el corpus', () => {
    expect(report.gaps.endpoints).toContain('POST /api/auth/logout');
    expect(report.gaps.endpoints).toContain(
      'POST /api/inpatient/critical-results/:criticalId/acknowledge',
    );
    expect(report.gaps.auditEvents).toContain('inpatient.transferred');
    expect(report.gaps.auditEvents).not.toContain('auth.login.success');
  });

  it('cubre eventos de auditoría declarados en expected.auditMustInclude', () => {
    const loginEvent = report.auditEventMatrix.find((c) => c.eventType === 'auth.login.success');
    expect(loginEvent?.coveredBy).toEqual(['test-draft-001']);

    const approvedEvent = report.auditEventMatrix.find(
      (c) => c.eventType === 'clinical.draft.approved',
    );
    expect(approvedEvent?.coveredBy).toEqual([]);
  });

  it('resume cobertura por módulo', () => {
    const audit = report.moduleSummary.find((m) => m.module === 'audit');
    expect(audit).toEqual({ module: 'audit', covered: 1, total: 1 });

    const inpatient = report.moduleSummary.find((m) => m.module === 'inpatient');
    expect(inpatient?.covered).toBe(0);
  });

  it('propaga la novedad cuando hay embeddings y la marca disponible', () => {
    const novelty = new Map<string, number | null>([
      ['test-draft-001', 0.42],
      ['test-census-001', null],
    ]);
    const withNovelty = buildFitnessReport([draftScenario, censusScenario], novelty);
    expect(withNovelty.scenarios.find((s) => s.id === 'test-draft-001')?.novelty).toBe(0.42);
    expect(withNovelty.noveltyAvailable).toBe(true);
    expect(report.noveltyAvailable).toBe(false);
  });
});
