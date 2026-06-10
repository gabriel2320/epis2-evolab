import { describe, expect, it } from 'vitest';
import { ScenarioDefinitionSchema, type ScenarioDefinition } from '../contracts/schemas.js';
import {
  buildRepairPrompt,
  createOperators,
  DEFAULT_ENSEMBLE,
  type MutationTask,
} from './operators.js';

function makeScenario(id: string, overrides: Record<string, unknown> = {}): ScenarioDefinition {
  return ScenarioDefinitionSchema.parse({
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
  });
}

function findOperator(name: string) {
  const operator = createOperators().find((op) => op.name === name);
  if (!operator) throw new Error(`Operador no encontrado: ${name}`);
  return operator;
}

function makeTask(overrides: Partial<MutationTask> = {}): MutationTask {
  return {
    operator: 'role_swap',
    parent: makeScenario('parent-001'),
    variantId: 'parent-001-m8rs-001',
    params: { targetRole: 'nurse' },
    index: 0,
    ...overrides,
  };
}

describe('createOperators', () => {
  it('expone los 4 operadores de la spec con el ensemble validado', () => {
    const operators = createOperators();
    expect(operators.map((o) => o.name)).toEqual([
      'role_swap',
      'payload_perturbation',
      'step_injection',
      'crossover',
    ]);
    expect(findOperator('role_swap').model).toBe(DEFAULT_ENSEMBLE.amplitude);
    expect(findOperator('step_injection').model).toBe(DEFAULT_ENSEMBLE.amplitude);
    expect(findOperator('payload_perturbation').model).toBe(DEFAULT_ENSEMBLE.depth);
    expect(findOperator('crossover').model).toBe(DEFAULT_ENSEMBLE.depth);
  });

  it('todos los prompts incluyen reglas de formato, RBAC y allowlist', () => {
    const task = makeTask();
    for (const operator of createOperators()) {
      const { system } = operator.buildPrompt({ ...task, operator: operator.name });
      expect(system).toContain('EXACTAMENTE UNA clave');
      expect(system).toContain('MATRIZ RBAC');
      expect(system).toContain('POST /api/drafts/{draftId}/approve');
    }
  });
});

describe('role_swap prompt', () => {
  it('incluye rol destino, id prescrito y el escenario padre', () => {
    const { user } = findOperator('role_swap').buildPrompt(makeTask());
    expect(user).toContain('a "nurse"');
    expect(user).toContain('parent-001-m8rs-001');
    expect(user).toContain('"id": "parent-001"');
    expect(user).toContain('matriz RBAC');
  });
});

describe('payload_perturbation prompt', () => {
  it('incluye la instrucción de limpieza de dependencias y el campo objetivo', () => {
    const { user } = findOperator('payload_perturbation').buildPrompt(
      makeTask({
        operator: 'payload_perturbation',
        params: {
          targetLabel: 'draft_create',
          targetField: 'patientId',
          perturbationKind: 'campo_faltante',
        },
      }),
    );
    expect(user).toContain('ELIMINA los pasos posteriores');
    expect(user).toContain('"draft_create"');
    expect(user).toContain('elimina el campo "patientId"');
    expect(user).toContain('expected.actionBlocked debe ser true');
  });
});

describe('step_injection prompt', () => {
  it('incluye la lista de placeholders calculada por el motor (no por el LLM)', () => {
    const { user } = findOperator('step_injection').buildPrompt(
      makeTask({
        operator: 'step_injection',
        params: {
          afterLabel: 'draft_create',
          intent: 'verificar el borrador con GET',
          availablePlaceholders: 'draftId, encounterId, patientId, today',
        },
      }),
    );
    expect(user).toContain('[draftId, encounterId, patientId, today]');
    expect(user).toContain('después del paso con label "draft_create"');
    expect(user).toContain('exactamente 4 pasos');
  });
});

describe('crossover prompt', () => {
  it('incluye ambos padres y los puntos de corte', () => {
    const parentB = makeScenario('parent-002');
    const { user } = findOperator('crossover').buildPrompt(
      makeTask({
        operator: 'crossover',
        secondParent: parentB,
        params: { cutA: 'draft_create', cutB: 'draft_approve' },
      }),
    );
    expect(user).toContain('"id": "parent-002"');
    expect(user).toContain('hasta el paso con label "draft_create"');
    expect(user).toContain('desde el paso con label "draft_approve"');
    expect(user).toContain('unión de las capabilities');
  });
});

describe('buildRepairPrompt', () => {
  it('pasa los errores literales y exige cambio mínimo', () => {
    const { user } = buildRepairPrompt({ id: 'x' }, [
      'flow[2] placeholder {draftId} no definido antes de su uso',
    ]);
    expect(user).toContain('flow[2] placeholder {draftId} no definido antes de su uso');
    expect(user).toContain('cambiando lo MÍNIMO necesario');
    expect(user).toContain('ELIMINA los pasos posteriores');
  });
});
