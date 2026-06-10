import { describe, expect, it } from 'vitest';
import type { RunEvidenceBundle } from '../evidence/collector.js';
import type {
  Epis2ApiTargetAdapter,
  Epis2BrowserTargetAdapter,
  TargetSession,
} from '../target/types.js';
import { loadScenario } from '../scenarios/loader.js';
import { executeRoleEvolutionSign001, executeScenario } from '../scenarios/executor.js';
import { buildStepContext, executeDeclarativeSteps, resolvePlaceholders } from './engine.js';
import { DeclarativeStepSchema } from './schema.js';

const SESSION: TargetSession = {
  cookies: 'session=test',
  username: 'admin.demo',
  role: 'admin',
};

function makeMockAdapters() {
  const browserCalls: string[] = [];
  const apiCalls: string[] = [];

  const api: Epis2ApiTargetAdapter = {
    health: async () => ({ ok: true, status: 200, latencyMs: 1 }),
    login: async () => SESSION,
    apiRequest: async (_session, method, path) => {
      apiCalls.push(`${method} ${path}`);
      return {
        ok: false,
        status: 403,
        latencyMs: 5,
        body: { error: 'forbidden' },
        headers: {},
      };
    },
  };

  const visibility: Record<string, boolean> = {
    'epis2-forbidden': false,
    'epis2-draft-approve': false,
  };

  const browser: Epis2BrowserTargetAdapter = {
    open: async (path) => {
      browserCalls.push(`open ${path}`);
    },
    fill: async () => {},
    fillByLabel: async () => {},
    click: async () => {},
    isVisible: async (testId) => {
      browserCalls.push(`isVisible ${testId}`);
      return visibility[testId] ?? false;
    },
    waitForTestId: async (testId) => {
      browserCalls.push(`waitForTestId ${testId}`);
      return testId === 'epis2-draft-review';
    },
    screenshot: async (label) => {
      browserCalls.push(`screenshot ${label}`);
      return `/tmp/${label}.png`;
    },
    currentUrl: async () => 'http://127.0.0.1:5173/espacio/borrador/x',
    close: async () => {},
  };

  const writeApi = (label: string, _payload: Record<string, unknown>) => `api/${label}.json`;

  return { api, browser, writeApi, browserCalls, apiCalls };
}

describe('step-engine', () => {
  it('resuelve placeholders desde fixture + demo case', () => {
    const scenario = loadScenario('role-evolution-sign-001');
    const ctx = buildStepContext(scenario);
    expect(ctx.draftId).toBe('d0000001-0000-4000-8000-000000000001');
    expect(ctx.demoCaseCode).toBe('DEMO-002');
    expect(ctx.patientId).toBeTruthy();
    expect(resolvePlaceholders('/espacio/borrador/{draftId}', ctx)).toBe(
      '/espacio/borrador/d0000001-0000-4000-8000-000000000001',
    );
  });

  it('falla con mensaje claro ante placeholder desconocido', () => {
    expect(() => resolvePlaceholders('/x/{noExiste}', {})).toThrow('Placeholder sin resolver');
  });

  it('rechaza pasos malformados via schema', () => {
    expect(DeclarativeStepSchema.safeParse({ api: { label: 'x' } }).success).toBe(false);
    expect(
      DeclarativeStepSchema.safeParse({
        api: { label: 'x', method: 'POST', path: '/api/x' },
      }).success,
    ).toBe(true);
    expect(DeclarativeStepSchema.safeParse({ login: null }).success).toBe(true);
  });

  it('paridad: flow declarativo produce las mismas observaciones que el ejecutor TS golden', async () => {
    const scenario = loadScenario('role-evolution-sign-001');
    expect(scenario.flow?.length).toBeGreaterThan(0);

    const golden = makeMockAdapters();
    const goldenResult = await executeRoleEvolutionSign001(
      scenario,
      golden.api,
      golden.browser,
      SESSION,
      {} as RunEvidenceBundle,
      golden.writeApi,
    );

    const declarative = makeMockAdapters();
    const declarativeResult = await executeDeclarativeSteps(scenario, scenario.flow ?? [], {
      api: declarative.api,
      browser: declarative.browser,
      session: SESSION,
      writeApi: declarative.writeApi,
    });

    expect(declarativeResult.error).toBeUndefined();
    expect(declarativeResult.observations).toEqual(goldenResult.observations);
    expect(declarative.browserCalls).toEqual(golden.browserCalls);
    expect(declarative.apiCalls).toEqual(golden.apiCalls);
  });

  it('executeScenario despacha a modo declarative cuando hay flow', async () => {
    const scenario = loadScenario('role-evolution-sign-001');
    const mocks = makeMockAdapters();
    const result = await executeScenario(scenario, {
      api: mocks.api,
      browser: mocks.browser,
      apiBaseUrl: 'http://127.0.0.1:3001',
      webBaseUrl: 'http://127.0.0.1:5173',
      evidence: {} as RunEvidenceBundle,
      writeApi: mocks.writeApi,
      session: SESSION,
    });
    expect(result.executionMode).toBe('declarative');
    expect(result.error).toBeUndefined();
    expect(result.observations.some((o) => o.kind === 'api_response')).toBe(true);
  });

  it('reporta error accionable si un demoCaseCode es desconocido', async () => {
    const scenario = loadScenario('role-evolution-sign-001');
    const broken = {
      ...scenario,
      fixture: { ...scenario.fixture, demoCaseCode: 'DEMO-999' },
    };
    const mocks = makeMockAdapters();
    const result = await executeDeclarativeSteps(broken, scenario.flow ?? [], {
      api: mocks.api,
      browser: mocks.browser,
      session: SESSION,
      writeApi: mocks.writeApi,
    });
    expect(result.error).toContain('DEMO-999');
  });
});
