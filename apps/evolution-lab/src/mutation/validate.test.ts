import { describe, expect, it } from 'vitest';
import { ScenarioDefinitionSchema, type ScenarioDefinition } from '../contracts/schemas.js';
import type { MutationTask } from './operators.js';
import { dryRunFlow, isPathAllowed, isRepairable, validateCandidate } from './validate.js';

function makeRaw(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    version: 1,
    name: `Escenario ${id}`,
    risk: 'medium',
    target: { capabilities: ['draft_lifecycle'] },
    persona: { role: 'physician' },
    fixture: { type: 'synthetic-draft-lifecycle', demoCaseCode: 'DEMO-002' },
    goal: { action: 'approve_draft' },
    steps: ['login', 'create', 'approve'],
    flow: [
      { login: { label: 'login_physician' } },
      {
        api: {
          label: 'draft_create',
          method: 'POST',
          path: '/api/drafts',
          body: { patientId: '{patientId}', title: 'Demo' },
          capture: { draftId: 'draft.id' },
        },
      },
      {
        api: {
          label: 'draft_approve',
          method: 'POST',
          path: '/api/drafts/{draftId}/approve',
        },
      },
    ],
    expected: { actionBlocked: false },
    evaluators: ['functional'],
    actionObservation: 'draft_approve',
    ...overrides,
  };
}

function makeScenario(id: string, overrides: Record<string, unknown> = {}): ScenarioDefinition {
  return ScenarioDefinitionSchema.parse(makeRaw(id, overrides));
}

const emptyCorpus = { corpusIds: new Set<string>() };

describe('validateCandidate — capa 1 (Zod)', () => {
  it('acepta un escenario bien formado', () => {
    const result = validateCandidate(makeRaw('variant-001'), emptyCorpus);
    expect(result.valid).toBe(true);
  });

  it('falla Zod con issues no reparables (descarte directo)', () => {
    const result = validateCandidate({ id: 'roto' }, emptyCorpus);
    expect(result.valid).toBe(false);
    expect(result.issues.every((i) => i.layer === 'zod' && !i.repairable)).toBe(true);
    expect(isRepairable(result)).toBe(false);
  });
});

describe('validateCandidate — capa 2 (semántica)', () => {
  it('detecta placeholder colgante al romper la cadena de captures (R1)', () => {
    const raw = makeRaw('variant-002');
    const flow = raw.flow as Array<Record<string, Record<string, unknown>>>;
    delete flow[1]!.api!.capture;
    const result = validateCandidate(raw, emptyCorpus);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes('placeholder {draftId}'))).toBe(true);
    expect(isRepairable(result)).toBe(true);
  });

  it('detecta colisión de id contra el corpus', () => {
    const result = validateCandidate(makeRaw('existing-001'), {
      corpusIds: new Set(['existing-001']),
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes('colisiona'))).toBe(true);
  });

  it('descarta sin reparación paths fuera del allowlist sandbox', () => {
    const raw = makeRaw('variant-003', {
      flow: [
        { login: { label: 'login_physician' } },
        { api: { label: 'fuera', method: 'POST', path: '/api/admin/danger' } },
      ],
      actionObservation: 'fuera',
    });
    const result = validateCandidate(raw, emptyCorpus);
    expect(result.valid).toBe(false);
    const allowlistIssue = result.issues.find((i) => i.message.includes('allowlist'));
    expect(allowlistIssue?.repairable).toBe(false);
    expect(isRepairable(result)).toBe(false);
  });

  it('detecta actionObservation apuntando a un label inexistente', () => {
    const raw = makeRaw('variant-004', { actionObservation: 'label_fantasma' });
    const result = validateCandidate(raw, emptyCorpus);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes('label_fantasma'))).toBe(true);
  });

  it('detecta rol fuera del catálogo', () => {
    const raw = makeRaw('variant-005', { persona: { role: 'hacker' } });
    const result = validateCandidate(raw, emptyCorpus);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes('Rol inválido'))).toBe(true);
  });

  it('detecta expected.actionBlocked incoherente con la matriz RBAC', () => {
    const raw = makeRaw('variant-006', {
      persona: { role: 'nurse' },
      goal: { action: 'approve_nursing_note' },
      expected: { actionBlocked: false },
    });
    const result = validateCandidate(raw, emptyCorpus);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes('matriz RBAC'))).toBe(true);
  });

  it('valida invariantes por operador (step_injection debe añadir 1 paso)', () => {
    const parent = makeScenario('parent-001');
    const task: MutationTask = {
      operator: 'step_injection',
      parent,
      variantId: 'parent-001-m8si-001',
      params: { afterLabel: 'draft_create' },
      index: 0,
    };
    const result = validateCandidate(makeRaw('parent-001-m8si-001'), {
      corpusIds: new Set<string>(),
      task,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes('exactamente 4 pasos'))).toBe(true);
  });
});

describe('dryRunFlow — capa 3 (dry-run sin HTTP)', () => {
  it('un flow con captures coherentes pasa el dry-run', () => {
    expect(dryRunFlow(makeScenario('variant-007'))).toEqual([]);
  });

  it('detecta placeholder colgante en body anidado', () => {
    const scenario = makeScenario('variant-008', {
      flow: [
        { login: { label: 'login_physician' } },
        {
          api: {
            label: 'draft_create',
            method: 'POST',
            path: '/api/drafts',
            body: { nested: { ref: '{ghostId}' } },
          },
        },
      ],
      actionObservation: 'draft_create',
    });
    const issues = dryRunFlow(scenario);
    expect(issues.some((i) => i.message.includes('{ghostId}'))).toBe(true);
  });

  it('reconoce captures de custom steps del catálogo', () => {
    const scenario = makeScenario('variant-009', {
      flow: [
        { login: { label: 'login_physician' } },
        { custom: { name: 'find_available_bed', args: { label: 'available_bed' } } },
        {
          api: {
            label: 'admit',
            method: 'POST',
            path: '/api/inpatient/admissions',
            body: { bedId: '{bedId}', patientId: '{patientId}' },
          },
        },
      ],
      actionObservation: 'admit',
    });
    expect(dryRunFlow(scenario)).toEqual([]);
  });
});

describe('isPathAllowed', () => {
  it('acepta paths del catálogo con placeholders y query strings', () => {
    expect(isPathAllowed('POST', '/api/drafts/{draftId}/approve')).toBe(true);
    expect(isPathAllowed('GET', '/api/dashboard/service?unit=CIRUGIA-DEMO')).toBe(true);
  });

  it('rechaza paths fuera del sandbox', () => {
    expect(isPathAllowed('POST', '/api/admin/users')).toBe(false);
    expect(isPathAllowed('DELETE', '/api/drafts/{draftId}')).toBe(false);
  });
});

describe('isRepairable — política §2.7', () => {
  it('rechaza reparación con más de 4 errores', () => {
    const flow = [
      { login: { label: 'login_physician' } },
      ...[1, 2, 3, 4, 5].map((n) => ({
        api: { label: `paso_${n}`, method: 'GET', path: `/api/drafts/{ghost${n}}` },
      })),
    ];
    const result = validateCandidate(
      makeRaw('variant-010', { flow, actionObservation: 'paso_1' }),
      {
        corpusIds: new Set<string>(),
      },
    );
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(4);
    expect(isRepairable(result)).toBe(false);
  });
});
