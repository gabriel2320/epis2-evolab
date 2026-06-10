import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { ScenarioDefinitionSchema, type ScenarioDefinition } from '../contracts/schemas.js';
import type {
  MutationGenerationRequest,
  MutationGenerationResult,
  ScenarioMutationClient,
} from './ollama-mutator.js';
import { createOperators, DEFAULT_ENSEMBLE } from './operators.js';
import { buildTask, runMutationPipeline, structuralHash } from './pipeline.js';

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

/** Variante válida tipo role_swap de parent-001 con el id prescrito. */
function validVariant(variantId: string): Record<string, unknown> {
  const scenario = makeScenario(variantId, {
    persona: { role: 'nurse' },
    expected: { actionBlocked: true },
    flow: [
      { login: { label: 'login_nurse' } },
      {
        api: {
          label: 'draft_create',
          method: 'POST',
          path: '/api/drafts',
          body: { patientId: '{patientId}', title: 'Demo nurse' },
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
  });
  return JSON.parse(JSON.stringify(scenario)) as Record<string, unknown>;
}

/** Variante con placeholder colgante (modo de fallo dominante del benchmark). */
function brokenVariant(variantId: string): Record<string, unknown> {
  const variant = validVariant(variantId);
  const flow = variant.flow as Array<Record<string, Record<string, unknown>>>;
  delete flow[1]!.api!.capture;
  return variant;
}

function makeClient(
  responder: (req: MutationGenerationRequest, call: number) => unknown,
): ScenarioMutationClient & { calls: MutationGenerationRequest[] } {
  const calls: MutationGenerationRequest[] = [];
  return {
    calls,
    generate(req: MutationGenerationRequest): Promise<MutationGenerationResult> {
      calls.push(req);
      const data = responder(req, calls.length);
      return Promise.resolve({ ok: true, data, raw: JSON.stringify(data), durationMs: 5 });
    },
  };
}

const roleSwapOperator = createOperators().filter((op) => op.name === 'role_swap');

describe('runMutationPipeline', () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), 'evolab-candidates-'));
  });

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  it('acepta variantes válidas y las escribe como YAML en candidates/ (no en el corpus)', async () => {
    const corpus = [makeScenario('parent-001')];
    const client = makeClient(() => validVariant('parent-001-m8rs-001'));

    const result = await runMutationPipeline({
      count: 1,
      operators: roleSwapOperator,
      corpus,
      client,
      outputDir,
      repairModel: DEFAULT_ENSEMBLE.repair,
      embeddings: null,
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.status).toBe('accepted');
    expect(result.records[0]!.validDirect).toBe(true);
    expect(result.records[0]!.repaired).toBe(false);
    expect(result.acceptedPaths).toHaveLength(1);
    expect(result.acceptedPaths[0]!.startsWith(outputDir)).toBe(true);

    const written = readdirSync(outputDir);
    expect(written).toEqual(['parent-001-m8rs-001.yaml']);
    const reloaded = ScenarioDefinitionSchema.parse(
      parseYaml(readFileSync(join(outputDir, written[0]!), 'utf8')),
    );
    expect(reloaded.persona.role).toBe('nurse');
  });

  it('repara una vez con el modelo 14b pasando los errores literales', async () => {
    const corpus = [makeScenario('parent-001')];
    const client = makeClient((req, call) =>
      call === 1 ? brokenVariant('parent-001-m8rs-001') : validVariant('parent-001-m8rs-001'),
    );

    const result = await runMutationPipeline({
      count: 1,
      operators: roleSwapOperator,
      corpus,
      client,
      outputDir,
      repairModel: DEFAULT_ENSEMBLE.repair,
      embeddings: null,
    });

    expect(client.calls).toHaveLength(2);
    expect(client.calls[0]!.model).toBe(DEFAULT_ENSEMBLE.amplitude);
    expect(client.calls[1]!.model).toBe(DEFAULT_ENSEMBLE.repair);
    expect(client.calls[1]!.temperature).toBe(0.2);
    expect(client.calls[1]!.user).toContain('placeholder {draftId}');

    const record = result.records[0]!;
    expect(record.status).toBe('accepted');
    expect(record.validDirect).toBe(false);
    expect(record.repaired).toBe(true);
    expect(record.attempts).toBe(2);
  });

  it('descarta tras un único intento de reparación fallido (sin segundo reintento)', async () => {
    const corpus = [makeScenario('parent-001')];
    const client = makeClient(() => brokenVariant('parent-001-m8rs-001'));

    const result = await runMutationPipeline({
      count: 1,
      operators: roleSwapOperator,
      corpus,
      client,
      outputDir,
      repairModel: DEFAULT_ENSEMBLE.repair,
      embeddings: null,
    });

    expect(client.calls).toHaveLength(2);
    const record = result.records[0]!;
    expect(record.status).toBe('discarded');
    expect(record.discardReason).toBe('invalid_after_repair');
    expect(record.issues.some((m) => m.includes('{draftId}'))).toBe(true);
    expect(readdirSync(outputDir)).toEqual([]);
  });

  it('descarta duplicados estructurales contra corpus y sesión', async () => {
    // El corpus ya contiene un gemelo estructural de la variante (solo difieren id/labels).
    const parent = makeScenario('parent-001');
    const twinRaw = validVariant('twin-001');
    const twin = ScenarioDefinitionSchema.parse(twinRaw);
    const corpus = [parent, twin];
    const client = makeClient(() => validVariant('parent-001-m8rs-001'));

    const result = await runMutationPipeline({
      count: 1,
      operators: roleSwapOperator,
      corpus,
      client,
      outputDir,
      repairModel: DEFAULT_ENSEMBLE.repair,
      embeddings: null,
    });

    expect(result.records[0]!.status).toBe('discarded');
    expect(result.records[0]!.discardReason).toBe('duplicate');
    expect(readdirSync(outputDir)).toEqual([]);
  });

  it('descarta por baja novedad con embeddings disponibles', async () => {
    const corpus = [makeScenario('parent-001')];
    const client = makeClient(() => validVariant('parent-001-m8rs-001'));
    const embeddings = {
      model: 'bge-m3',
      embed: (texts: string[]) => Promise.resolve(texts.map(() => [1, 0, 0])),
    };

    const result = await runMutationPipeline({
      count: 1,
      operators: roleSwapOperator,
      corpus,
      client,
      outputDir,
      repairModel: DEFAULT_ENSEMBLE.repair,
      embeddings,
      noveltyThreshold: 0.5,
    });

    expect(result.records[0]!.status).toBe('discarded');
    expect(result.records[0]!.discardReason).toBe('low_novelty');
    expect(result.noveltyAvailable).toBe(true);
  });

  it('endurece requiresHumanReview heredado del padre (nunca se relaja)', async () => {
    const corpus = [makeScenario('parent-001', { requiresHumanReview: true })];
    const client = makeClient(() => validVariant('parent-001-m8rs-001'));

    await runMutationPipeline({
      count: 1,
      operators: roleSwapOperator,
      corpus,
      client,
      outputDir,
      repairModel: DEFAULT_ENSEMBLE.repair,
      embeddings: null,
    });

    const written = readdirSync(outputDir);
    const reloaded = ScenarioDefinitionSchema.parse(
      parseYaml(readFileSync(join(outputDir, written[0]!), 'utf8')),
    );
    expect(reloaded.requiresHumanReview).toBe(true);
  });
});

describe('buildTask', () => {
  const corpus = [makeScenario('parent-001'), makeScenario('parent-002')];

  it('role_swap varía el rol destino y prescribe el id de la variante', () => {
    const operator = createOperators().find((op) => op.name === 'role_swap')!;
    const task = buildTask(operator, corpus, 0);
    expect(task?.params.targetRole).not.toBe(task?.parent.persona.role);
    expect(task?.variantId).toContain('-m8rs-');
  });

  it('step_injection calcula determinísticamente los placeholders disponibles', () => {
    const operator = createOperators().find((op) => op.name === 'step_injection')!;
    const task = buildTask(operator, corpus, 0);
    const placeholders = task?.params.availablePlaceholders ?? '';
    expect(placeholders).toContain('draftId');
    expect(placeholders).toContain('patientId');
    expect(placeholders).toContain('today');
  });

  it('crossover elige padres compatibles por fixture o capabilities', () => {
    const operator = createOperators().find((op) => op.name === 'crossover')!;
    const task = buildTask(operator, corpus, 0);
    expect(task?.secondParent).toBeDefined();
    expect(task?.parent.id).not.toBe(task?.secondParent?.id);
  });
});

describe('structuralHash', () => {
  it('ignora id, name y labels pero distingue cambios de body', () => {
    const a = makeScenario('a-001');
    const b = makeScenario('b-001', { name: 'Otro nombre' });
    expect(structuralHash(a)).toBe(structuralHash(b));

    const c = makeScenario('c-001');
    const flow = JSON.parse(JSON.stringify(c.flow)) as Array<Record<string, unknown>>;
    (flow[1] as { api: { body: Record<string, unknown> } }).api.body = { title: 'Distinto' };
    const d = makeScenario('d-001', { flow });
    expect(structuralHash(c)).not.toBe(structuralHash(d));
  });
});
