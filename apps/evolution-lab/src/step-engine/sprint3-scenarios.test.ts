import { describe, expect, it } from 'vitest';
import { getDemoCaseByCode } from '@evolab/demo-fixtures';
import type {
  Epis2ApiTargetAdapter,
  Epis2BrowserTargetAdapter,
  TargetApiResponse,
  TargetSession,
} from '../target/types.js';
import { loadScenario } from '../scenarios/loader.js';
import { executeDeclarativeSteps } from './engine.js';
import { buildEvaluatorsForScenario } from '../evaluators/deterministic.js';

const SESSION: TargetSession = {
  cookies: 'session=test',
  username: 'medico.demo',
  role: 'physician',
};

type ApiRoute = (method: string, path: string, body?: unknown) => TargetApiResponse | undefined;

function makeRoutedAdapters(route: ApiRoute) {
  const apiCalls: string[] = [];

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
    open: async () => {},
    fill: async () => {},
    fillByLabel: async () => {},
    click: async () => {},
    isVisible: async () => false,
    waitForTestId: async () => false,
    screenshot: async (label) => `/tmp/${label}.png`,
    currentUrl: async () => 'http://127.0.0.1:5173/probe',
    close: async () => {},
  };

  const writeApi = (label: string, _payload: Record<string, unknown>) => `api/${label}.json`;

  return { api, browser, writeApi, apiCalls };
}

const ok = (status: number, body: unknown): TargetApiResponse => ({
  ok: status < 400,
  status,
  latencyMs: 2,
  body,
  headers: {},
});

function runEvaluators(
  scenario: ReturnType<typeof loadScenario>,
  observations: Awaited<ReturnType<typeof executeDeclarativeSteps>>['observations'],
) {
  const evaluators = buildEvaluatorsForScenario(scenario);
  return evaluators.map((ev) =>
    ev.evaluate({
      runId: 'run-test',
      scenarioId: scenario.id,
      expected: scenario.expected,
      observations,
      ...(scenario.actionObservation !== undefined
        ? { actionObservation: scenario.actionObservation }
        : {}),
    }),
  );
}

describe('sprint 3 — escenarios tramo C declarativos', () => {
  it('admission-double-booking-001: 409 se evalúa como bloqueo correcto', async () => {
    const scenario = loadScenario('admission-double-booking-001');
    expect(scenario.flow?.length).toBeGreaterThan(0);

    const mocks = makeRoutedAdapters((method, path) => {
      if (method === 'POST' && path === '/api/inpatient/admissions') {
        return ok(409, { error: 'El paciente ya tiene una admisión activa' });
      }
      return undefined;
    });

    const result = await executeDeclarativeSteps(scenario, scenario.flow ?? [], {
      api: mocks.api,
      browser: mocks.browser,
      session: SESSION,
      writeApi: mocks.writeApi,
    });

    expect(result.error).toBeUndefined();
    const attempt = result.observations.find((o) => o.label === 'admission_attempt');
    expect(attempt?.payload.status).toBe(409);

    const functional = runEvaluators(scenario, result.observations).find(
      (e) => e.evaluatorId === 'functional',
    );
    expect(functional?.passed).toBe(true);
  });

  it('role-nurse-approve-001: captura draftId y reporta 403 en approve', async () => {
    const scenario = loadScenario('role-nurse-approve-001');
    expect(scenario.flow?.length).toBeGreaterThan(0);
    expect(scenario.persona.role).toBe('nurse');

    const mocks = makeRoutedAdapters((method, path) => {
      if (method === 'POST' && path === '/api/drafts') {
        return ok(201, { draft: { id: 'aaaa1111-0000-4000-8000-000000000001' } });
      }
      if (
        method === 'POST' &&
        path === '/api/drafts/aaaa1111-0000-4000-8000-000000000001/approve'
      ) {
        return ok(403, { error: 'Sin permiso', permission: 'draft.approve' });
      }
      return undefined;
    });

    const result = await executeDeclarativeSteps(scenario, scenario.flow ?? [], {
      api: mocks.api,
      browser: mocks.browser,
      session: SESSION,
      writeApi: mocks.writeApi,
    });

    expect(result.error).toBeUndefined();
    const attempt = result.observations.find((o) => o.label === 'nurse_approve_attempt');
    expect(attempt?.payload.status).toBe(403);
    expect(attempt?.payload.draftId).toBe('aaaa1111-0000-4000-8000-000000000001');

    const functional = runEvaluators(scenario, result.observations).find(
      (e) => e.evaluatorId === 'functional',
    );
    expect(functional?.passed).toBe(true);
  });

  it('role-nurse-approve-001: falla accionable si el draft no se crea', async () => {
    const scenario = loadScenario('role-nurse-approve-001');
    const mocks = makeRoutedAdapters((method, path) => {
      if (method === 'POST' && path === '/api/drafts') {
        return ok(400, { error: 'Borrador inválido' });
      }
      return undefined;
    });

    const result = await executeDeclarativeSteps(scenario, scenario.flow ?? [], {
      api: mocks.api,
      browser: mocks.browser,
      session: SESSION,
      writeApi: mocks.writeApi,
    });

    expect(result.error).toContain('No se pudo crear nota de enfermería');
  });

  it('draft-lifecycle-cancelled-001: create → cancel → approve 409', async () => {
    const scenario = loadScenario('draft-lifecycle-cancelled-001');
    expect(scenario.flow?.length).toBeGreaterThan(0);

    const draftId = 'bbbb2222-0000-4000-8000-000000000002';
    let cancelled = false;
    const mocks = makeRoutedAdapters((method, path) => {
      if (method === 'POST' && path === '/api/drafts') {
        return ok(201, { draft: { id: draftId } });
      }
      if (method === 'PATCH' && path === `/api/drafts/${draftId}`) {
        cancelled = true;
        return ok(200, { draft: { id: draftId, status: 'cancelled' } });
      }
      if (method === 'POST' && path === `/api/drafts/${draftId}/approve`) {
        return cancelled
          ? ok(409, { error: 'Estado de borrador no permite aprobación' })
          : ok(200, { draft: { id: draftId } });
      }
      return undefined;
    });

    const result = await executeDeclarativeSteps(scenario, scenario.flow ?? [], {
      api: mocks.api,
      browser: mocks.browser,
      session: SESSION,
      writeApi: mocks.writeApi,
    });

    expect(result.error).toBeUndefined();
    expect(mocks.apiCalls).toEqual([
      'POST /api/drafts',
      `PATCH /api/drafts/${draftId}`,
      `POST /api/drafts/${draftId}/approve`,
    ]);
    const attempt = result.observations.find((o) => o.label === 'cancelled_approve_attempt');
    expect(attempt?.payload.status).toBe(409);

    const functional = runEvaluators(scenario, result.observations).find(
      (e) => e.evaluatorId === 'functional',
    );
    expect(functional?.passed).toBe(true);
  });

  it('census-service-integrity-001: snapshot coherente pasa census_integrity', async () => {
    const scenario = loadScenario('census-service-integrity-001');
    expect(scenario.flow?.length).toBeGreaterThan(0);

    const demo = getDemoCaseByCode('DEMO-004');
    expect(demo).toBeTruthy();
    const patientId = demo?.patientId ?? '';

    const mocks = makeRoutedAdapters((method, path) => {
      if (method === 'GET' && path.startsWith('/api/dashboard/service')) {
        return ok(200, {
          readOnly: true,
          unitCode: 'CIRUGIA-DEMO',
          census: [
            {
              bedId: 'f0000002-0000-4000-8000-000000000001',
              status: 'occupied',
              patientId,
              admissionId: 'ad000001-0000-4000-8000-000000000001',
            },
            { bedId: 'f0000002-0000-4000-8000-000000000003', status: 'available' },
          ],
          unacknowledgedCriticals: [{ id: 'crit-1' }],
        });
      }
      return undefined;
    });

    const result = await executeDeclarativeSteps(scenario, scenario.flow ?? [], {
      api: mocks.api,
      browser: mocks.browser,
      session: SESSION,
      writeApi: mocks.writeApi,
    });

    expect(result.error).toBeUndefined();
    const snapshot = result.observations.find((o) => o.kind === 'census_snapshot');
    expect(snapshot?.payload).toMatchObject({
      bedCount: 2,
      occupiedCount: 1,
      occupiedWithoutPatient: 0,
      availableWithPatient: 0,
      demoPatientListed: true,
      unacknowledgedCriticalCount: 1,
    });

    const evals = runEvaluators(scenario, result.observations);
    const census = evals.find((e) => e.evaluatorId === 'census_integrity');
    expect(census?.passed).toBe(true);
  });

  it('census-service-integrity-001: cama ocupada sin paciente falla census_integrity', async () => {
    const scenario = loadScenario('census-service-integrity-001');

    const mocks = makeRoutedAdapters((method, path) => {
      if (method === 'GET' && path.startsWith('/api/dashboard/service')) {
        return ok(200, {
          census: [{ bedId: 'b1', status: 'occupied' }],
          unacknowledgedCriticals: [],
        });
      }
      return undefined;
    });

    const result = await executeDeclarativeSteps(scenario, scenario.flow ?? [], {
      api: mocks.api,
      browser: mocks.browser,
      session: SESSION,
      writeApi: mocks.writeApi,
    });

    const census = runEvaluators(scenario, result.observations).find(
      (e) => e.evaluatorId === 'census_integrity',
    );
    expect(census?.passed).toBe(false);
    expect(census?.severity).toBe('high');
  });
});
