import { describe, expect, it } from 'vitest';
import { getDemoCaseByCode } from '@evolab/demo-fixtures';
import type { RunEvidenceBundle } from '../evidence/collector.js';
import type {
  Epis2ApiTargetAdapter,
  Epis2BrowserTargetAdapter,
  TargetApiResponse,
  TargetSession,
} from '../target/types.js';
import { loadScenario } from '../scenarios/loader.js';
import { executeRoleEvolutionSign001, executeScenario } from '../scenarios/executor.js';
import { executeDischargeCriticalPending001 } from '../scenarios/discharge-critical-pending.js';
import { executeSuspendedMedicationMar001 } from '../scenarios/suspended-medication-mar.js';
import { buildStepContext, executeDeclarativeSteps, resolvePlaceholders } from './engine.js';
import { DeclarativeStepSchema } from './schema.js';
import { listCustomSteps } from './custom-steps.js';

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

  it('expone catálogo de custom steps', () => {
    expect(listCustomSteps()).toEqual([
      'census_snapshot',
      'discharge_alerts',
      'discharge_ui_probe',
      'mar_alerts',
      'mar_create_and_approve',
      'mar_dashboard',
      'service_criticals',
    ]);
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

type ApiRoute = (method: string, path: string, body?: unknown) => TargetApiResponse | undefined;

function makeRoutedAdapters(route: ApiRoute, visibility: Record<string, boolean>) {
  const apiCalls: string[] = [];
  const browserCalls: string[] = [];

  const api: Epis2ApiTargetAdapter = {
    health: async () => ({ ok: true, status: 200, latencyMs: 1 }),
    login: async () => SESSION,
    apiRequest: async (_session, method, path, body) => {
      apiCalls.push(`${method} ${path}`);
      return (
        route(method, path, body) ?? {
          ok: false,
          status: 404,
          latencyMs: 1,
          body: { error: 'not_found' },
          headers: {},
        }
      );
    },
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
      return visibility[testId] ?? false;
    },
    screenshot: async (label) => {
      browserCalls.push(`screenshot ${label}`);
      return `/tmp/${label}.png`;
    },
    currentUrl: async () => 'http://127.0.0.1:5173/probe',
    close: async () => {},
  };

  const writeApi = (label: string, _payload: Record<string, unknown>) => `api/${label}.json`;

  return { api, browser, writeApi, apiCalls, browserCalls };
}

describe('step-engine paridad escenarios complejos', () => {
  it('paridad discharge-critical-pending-001: flow == ejecutor TS golden', async () => {
    const scenario = loadScenario('discharge-critical-pending-001');
    expect(scenario.flow?.length).toBeGreaterThan(0);
    const demo = getDemoCaseByCode('DEMO-004');
    expect(demo).toBeTruthy();
    const patientId = demo?.patientId ?? '';

    const ok = (status: number, body: unknown): TargetApiResponse => ({
      ok: status < 400,
      status,
      latencyMs: 2,
      body,
      headers: {},
    });

    const route: ApiRoute = (method, path) => {
      if (method === 'GET' && path.startsWith('/api/dashboard/service')) {
        return ok(200, {
          unacknowledgedCriticals: [
            { id: 'crit-1', patientId, label: 'PCR crítico' },
            { id: 'crit-other', patientId: 'otro-paciente', label: 'otro' },
          ],
        });
      }
      if (method === 'GET' && path.includes('/clinical-alerts')) {
        return ok(200, { alerts: [{ id: 'critical_lab_without_ack' }] });
      }
      if (method === 'POST' && path === '/api/drafts') {
        return ok(201, { draft: { id: 'draft-discharge-1' } });
      }
      if (method === 'POST' && path === '/api/drafts/draft-discharge-1/approve') {
        return ok(200, { approved: true });
      }
      return undefined;
    };

    const visibility = {
      'epis2-generated-clinical-page': true,
      'epis2-clinical-alerts': true,
      'epis2-clinical-alert-critical_lab_without_ack': true,
      'epis2-form-sign': true,
    };

    const golden = makeRoutedAdapters(route, visibility);
    const goldenResult = await executeDischargeCriticalPending001(
      scenario,
      golden.api,
      golden.browser,
      SESSION,
      {} as RunEvidenceBundle,
      golden.writeApi,
    );

    const declarative = makeRoutedAdapters(route, visibility);
    const declarativeResult = await executeDeclarativeSteps(scenario, scenario.flow ?? [], {
      api: declarative.api,
      browser: declarative.browser,
      session: SESSION,
      writeApi: declarative.writeApi,
    });

    expect(declarativeResult.error).toBeUndefined();
    expect(goldenResult.error).toBeUndefined();
    expect(declarativeResult.observations).toEqual(goldenResult.observations);
    expect(declarative.apiCalls).toEqual(golden.apiCalls);
    expect(declarative.browserCalls).toEqual(golden.browserCalls);
  });

  it('paridad discharge: error si el create de borrador falla', async () => {
    const scenario = loadScenario('discharge-critical-pending-001');
    const route: ApiRoute = (method, path) => {
      if (method === 'POST' && path === '/api/drafts') {
        return { ok: false, status: 500, latencyMs: 1, body: { error: 'x' }, headers: {} };
      }
      return { ok: true, status: 200, latencyMs: 1, body: {}, headers: {} };
    };
    const declarative = makeRoutedAdapters(route, {});
    const result = await executeDeclarativeSteps(scenario, scenario.flow ?? [], {
      api: declarative.api,
      browser: declarative.browser,
      session: SESSION,
      writeApi: declarative.writeApi,
    });
    expect(result.error).toBe('No se pudo crear borrador de alta (HTTP 500)');
  });

  it('paridad suspended-medication-mar-001: flow == ejecutor TS golden', async () => {
    const scenario = loadScenario('suspended-medication-mar-001');
    expect(scenario.flow?.length).toBeGreaterThan(0);
    const demo = getDemoCaseByCode('DEMO-005');
    expect(demo).toBeTruthy();
    const patientId = demo?.patientId ?? '';

    const route: ApiRoute = (method, path) => {
      if (method === 'GET' && path === '/api/dashboard/nursing') {
        return {
          ok: true,
          status: 200,
          latencyMs: 2,
          body: {
            scheduledMar: [
              {
                id: 'dose-warfarina-1',
                medication: 'Warfarina sódica 5 mg',
                status: 'held',
                patientId,
                requiresDoubleCheck: true,
              },
            ],
          },
          headers: {},
        };
      }
      if (method === 'GET' && path.includes('/clinical-alerts')) {
        return {
          ok: true,
          status: 200,
          latencyMs: 2,
          body: { alerts: [{ id: 'medication_held' }] },
          headers: {},
        };
      }
      if (method === 'POST' && path === '/api/drafts') {
        return {
          ok: true,
          status: 201,
          latencyMs: 2,
          body: { draft: { id: 'draft-mar-1' } },
          headers: {},
        };
      }
      if (method === 'POST' && path === '/api/drafts/draft-mar-1/approve') {
        return {
          ok: false,
          status: 422,
          latencyMs: 2,
          body: { error: 'blocked' },
          headers: {},
        };
      }
      return undefined;
    };

    const golden = makeRoutedAdapters(route, {});
    const goldenResult = await executeSuspendedMedicationMar001(
      scenario,
      golden.api,
      golden.browser,
      SESSION,
      {} as RunEvidenceBundle,
      golden.writeApi,
    );

    const declarative = makeRoutedAdapters(route, {});
    const declarativeResult = await executeDeclarativeSteps(scenario, scenario.flow ?? [], {
      api: declarative.api,
      browser: declarative.browser,
      session: SESSION,
      writeApi: declarative.writeApi,
    });

    expect(declarativeResult.error).toBeUndefined();
    expect(goldenResult.error).toBeUndefined();
    expect(declarativeResult.observations).toEqual(goldenResult.observations);
    expect(declarative.apiCalls).toEqual(golden.apiCalls);
  });

  it('paridad MAR: fallback observado cuando create falla (sin error de run)', async () => {
    const scenario = loadScenario('suspended-medication-mar-001');
    const route: ApiRoute = (method, path) => {
      if (method === 'POST' && path === '/api/drafts') {
        return { ok: false, status: 422, latencyMs: 1, body: { error: 'x' }, headers: {} };
      }
      return { ok: true, status: 200, latencyMs: 1, body: {}, headers: {} };
    };

    const golden = makeRoutedAdapters(route, {});
    const goldenResult = await executeSuspendedMedicationMar001(
      scenario,
      golden.api,
      golden.browser,
      SESSION,
      {} as RunEvidenceBundle,
      golden.writeApi,
    );

    const declarative = makeRoutedAdapters(route, {});
    const declarativeResult = await executeDeclarativeSteps(scenario, scenario.flow ?? [], {
      api: declarative.api,
      browser: declarative.browser,
      session: SESSION,
      writeApi: declarative.writeApi,
    });

    expect(declarativeResult.error).toBeUndefined();
    expect(declarativeResult.observations).toEqual(goldenResult.observations);
    const fallback = declarativeResult.observations.find((o) => o.label === 'mar_approve_attempt');
    expect(fallback?.payload.error).toBe('draft_no_creado');
  });
});
