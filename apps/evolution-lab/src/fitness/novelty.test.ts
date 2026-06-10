import { describe, expect, it, vi } from 'vitest';
import { ScenarioDefinitionSchema, type ScenarioDefinition } from '../contracts/schemas.js';
import {
  canonicalScenarioText,
  computeCorpusNovelty,
  computeScenarioNovelty,
  cosineDistance,
  createInMemoryEmbeddingCache,
  type EmbeddingsClient,
} from './novelty.js';

function makeScenario(id: string, overrides: Record<string, unknown> = {}): ScenarioDefinition {
  return ScenarioDefinitionSchema.parse({
    id,
    version: 1,
    name: `Escenario ${id}`,
    description: 'Escenario de prueba',
    risk: 'low',
    target: { capabilities: ['demo'] },
    persona: { role: 'physician' },
    goal: { action: 'demo_action' },
    steps: ['login'],
    flow: [{ login: { label: 'login_physician' } }],
    expected: { actionBlocked: true },
    evaluators: ['functional'],
    ...overrides,
  });
}

/** Cliente mock: asigna un vector fijo por escenario (vía substring del texto canónico). */
function mockClient(vectorById: Record<string, number[]>): EmbeddingsClient {
  return {
    model: 'mock-embed',
    embed: vi.fn(async (texts: string[]) =>
      texts.map((text) => {
        const idLine = text.split('\n')[0] ?? '';
        const id = idLine.replace('id: ', '');
        return vectorById[id] ?? [0, 0, 1];
      }),
    ),
  };
}

function downClient(): EmbeddingsClient {
  return { model: 'mock-embed', embed: vi.fn(async () => null) };
}

describe('canonicalScenarioText', () => {
  it('es determinista e incluye id, rol, pasos y expected', () => {
    const scenario = makeScenario('demo-001');
    const text = canonicalScenarioText(scenario);
    expect(text).toContain('id: demo-001');
    expect(text).toContain('role: physician');
    expect(text).toContain('step: login');
    expect(text).toContain('expected.actionBlocked: true');
    expect(canonicalScenarioText(scenario)).toBe(text);
  });
});

describe('cosineDistance', () => {
  it('0 para vectores idénticos, 1 para ortogonales', () => {
    expect(cosineDistance([1, 0], [1, 0])).toBeCloseTo(0);
    expect(cosineDistance([1, 0], [0, 1])).toBeCloseTo(1);
  });
});

describe('computeCorpusNovelty', () => {
  it('corpus vacío produce mapa vacío', async () => {
    const novelty = await computeCorpusNovelty([], mockClient({}));
    expect(novelty.size).toBe(0);
  });

  it('corpus de un solo escenario produce null sin llamar a embeddings', async () => {
    const client = mockClient({ 'demo-001': [1, 0, 0] });
    const novelty = await computeCorpusNovelty([makeScenario('demo-001')], client);
    expect(novelty.get('demo-001')).toBeNull();
    expect(client.embed).not.toHaveBeenCalled();
  });

  it('duplicado exacto produce novedad ~0', async () => {
    const scenarios = [makeScenario('demo-001'), makeScenario('demo-002')];
    const client = mockClient({ 'demo-001': [1, 0, 0], 'demo-002': [1, 0, 0] });
    const novelty = await computeCorpusNovelty(scenarios, client);
    expect(novelty.get('demo-001')).toBeCloseTo(0, 5);
    expect(novelty.get('demo-002')).toBeCloseTo(0, 5);
  });

  it('escenario distinto del resto produce novedad alta', async () => {
    const scenarios = [
      makeScenario('demo-001'),
      makeScenario('demo-002'),
      makeScenario('demo-distinto'),
    ];
    const client = mockClient({
      'demo-001': [1, 0, 0],
      'demo-002': [1, 0, 0],
      'demo-distinto': [0, 1, 0],
    });
    const novelty = await computeCorpusNovelty(scenarios, client);
    expect(novelty.get('demo-distinto')).toBeCloseTo(1, 5);
    expect(novelty.get('demo-001')).toBeCloseTo(0, 5);
  });

  it('Ollama caído degrada a null para todo el corpus sin lanzar', async () => {
    const scenarios = [makeScenario('demo-001'), makeScenario('demo-002')];
    const novelty = await computeCorpusNovelty(scenarios, downClient());
    expect(novelty.get('demo-001')).toBeNull();
    expect(novelty.get('demo-002')).toBeNull();
  });

  it('reutiliza el cache de embeddings en la segunda pasada', async () => {
    const scenarios = [makeScenario('demo-001'), makeScenario('demo-002')];
    const client = mockClient({ 'demo-001': [1, 0, 0], 'demo-002': [0, 1, 0] });
    const cache = createInMemoryEmbeddingCache();

    await computeCorpusNovelty(scenarios, client, cache);
    await computeCorpusNovelty(scenarios, client, cache);

    expect(client.embed).toHaveBeenCalledTimes(1);
  });
});

describe('computeScenarioNovelty', () => {
  it('calcula la novedad de un escenario contra el corpus', async () => {
    const corpus = [makeScenario('demo-001'), makeScenario('demo-002')];
    const candidate = makeScenario('demo-nuevo');
    const client = mockClient({
      'demo-001': [1, 0, 0],
      'demo-002': [1, 0, 0],
      'demo-nuevo': [0, 1, 0],
    });
    const novelty = await computeScenarioNovelty(candidate, corpus, client);
    expect(novelty).toBeCloseTo(1, 5);
  });
});
