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
import type { ScenarioObservation } from '../evaluators/types.js';

const SESSION: TargetSession = {
  cookies: 'session=test',
  username: 'medico.demo',
  role: 'physician',
};

const PATIENT_ID = getDemoCaseByCode('DEMO-001')?.patientId ?? '';
const BED_FREE = 'f0000002-0000-4000-8000-000000000003';
const ADMISSION_ID = 'ad000001-0000-4000-8000-000000000009';
const DRAFT_ID = 'dddd0002-0000-4000-8000-000000000002';
const PREVIOUS_ADMISSION_ID = 'ad000001-0000-4000-8000-000000000001';

type ApiRoute = (method: string, path: string, body?: unknown) => TargetApiResponse | undefined;

const ok = (status: number, body: unknown): TargetApiResponse => ({
  ok: status < 400,
  status,
  latencyMs: 2,
  body,
  headers: {},
});

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

/** Censo demo: paciente del journey admitido o no según `admitted`; una cama libre. */
function censusBody(admitted: boolean) {
  return {
    census: [
      ...(admitted
        ? [
            {
              bedId: 'f0000002-0000-4000-8000-000000000001',
              status: 'occupied',
              patientId: PATIENT_ID,
              admissionId: PREVIOUS_ADMISSION_ID,
            },
          ]
        : [{ bedId: 'f0000002-0000-4000-8000-000000000001', status: 'blocked' }]),
      { bedId: BED_FREE, status: 'available' },
    ],
    unacknowledgedCriticals: [],
  };
}

function journeyRoute(opts: { initiallyAdmitted: boolean }): ApiRoute {
  let admitted = opts.initiallyAdmitted;
  return (method, path, body) => {
    if (method === 'GET' && path.startsWith('/api/dashboard/service')) {
      return ok(200, censusBody(admitted));
    }
    if (
      method === 'POST' &&
      path === `/api/inpatient/admissions/${PREVIOUS_ADMISSION_ID}/discharge`
    ) {
      admitted = false;
      return ok(200, { admissionId: PREVIOUS_ADMISSION_ID, patientId: PATIENT_ID });
    }
    if (method === 'POST' && path === '/api/inpatient/admissions') {
      const b = body as { patientId?: string; bedId?: string } | undefined;
      if (b?.patientId !== PATIENT_ID || b?.bedId !== BED_FREE) {
        return ok(400, { error: 'Ingreso hospitalario inválido' });
      }
      admitted = true;
      return ok(201, {
        admission: {
          id: ADMISSION_ID,
          patientId: PATIENT_ID,
          bedId: BED_FREE,
          bedLabel: '102-A',
          unitCode: 'CIRUGIA-DEMO',
          status: 'active',
        },
        requiresHumanReview: true,
      });
    }
    if (method === 'POST' && path === '/api/drafts') {
      return ok(201, { draft: { id: DRAFT_ID } });
    }
    if (method === 'POST' && path === `/api/drafts/${DRAFT_ID}/approve`) {
      return ok(200, { draft: { id: DRAFT_ID, status: 'approved' } });
    }
    if (method === 'POST' && path === `/api/inpatient/admissions/${ADMISSION_ID}/discharge`) {
      admitted = false;
      return ok(200, {
        admissionId: ADMISSION_ID,
        patientId: PATIENT_ID,
        dischargedAt: new Date().toISOString(),
        epicrisisRoute: '/espacio/epicrisis',
        requiresHumanReview: true,
      });
    }
    return undefined;
  };
}

function journeyAuditTrail(): ScenarioObservation {
  return {
    kind: 'audit_trail',
    label: 'post_run_events',
    payload: {
      eventCount: 5,
      events: [
        { eventType: 'auth.login.success' },
        { eventType: 'inpatient.admitted', entityId: ADMISSION_ID },
        { eventType: 'clinical.draft.created', entityId: DRAFT_ID },
        { eventType: 'clinical.draft.approved', entityId: DRAFT_ID },
        { eventType: 'inpatient.discharged', entityId: ADMISSION_ID },
      ],
    },
  };
}

describe('journey admission-discharge-001', () => {
  it('encadena admisión → epicrisis → alta con state carry (bedId, admissionId, draftId)', async () => {
    const scenario = loadScenario('admission-discharge-001');
    expect(scenario.flow?.length).toBeGreaterThan(0);

    const mocks = makeRoutedAdapters(journeyRoute({ initiallyAdmitted: false }));
    const result = await executeDeclarativeSteps(scenario, scenario.flow ?? [], {
      api: mocks.api,
      browser: mocks.browser,
      session: SESSION,
      writeApi: mocks.writeApi,
    });

    expect(result.error).toBeUndefined();
    expect(mocks.apiCalls).toEqual([
      'GET /api/dashboard/service?unit=CIRUGIA-DEMO',
      'GET /api/dashboard/service?unit=CIRUGIA-DEMO',
      'GET /api/dashboard/service?unit=CIRUGIA-DEMO',
      'POST /api/inpatient/admissions',
      'GET /api/dashboard/service?unit=CIRUGIA-DEMO',
      'POST /api/drafts',
      `POST /api/drafts/${DRAFT_ID}/approve`,
      `POST /api/inpatient/admissions/${ADMISSION_ID}/discharge`,
      'GET /api/dashboard/service?unit=CIRUGIA-DEMO',
    ]);

    const admission = result.observations.find((o) => o.label === 'admission_create');
    expect(admission?.payload).toMatchObject({ status: 201, ok: true, admissionId: ADMISSION_ID });

    const discharge = result.observations.find((o) => o.label === 'admission_discharge');
    expect(discharge?.payload).toMatchObject({ status: 200, ok: true, admissionId: ADMISSION_ID });

    // El censo intermedio refleja al paciente admitido.
    const afterAdmission = result.observations.find((o) => o.label === 'census_after_admission');
    expect(afterAdmission?.payload.demoPatientListed).toBe(true);
    const afterDischarge = result.observations.find((o) => o.label === 'census_after_discharge');
    expect(afterDischarge?.payload.demoPatientListed).toBe(false);

    // Evaluación completa con trail de auditoría del ciclo.
    const evaluations = buildEvaluatorsForScenario(scenario).map((ev) =>
      ev.evaluate({
        runId: '00000000-0000-4000-8000-000000000099',
        scenarioId: scenario.id,
        expected: scenario.expected,
        observations: [...result.observations, journeyAuditTrail()],
        ...(scenario.actionObservation !== undefined
          ? { actionObservation: scenario.actionObservation }
          : {}),
      }),
    );
    for (const ev of evaluations) {
      expect(ev.passed, `${ev.evaluatorId}: ${ev.message}`).toBe(true);
    }
  });

  it('es idempotente: da de alta una admisión previa antes de re-admitir', async () => {
    const scenario = loadScenario('admission-discharge-001');
    const mocks = makeRoutedAdapters(journeyRoute({ initiallyAdmitted: true }));
    const result = await executeDeclarativeSteps(scenario, scenario.flow ?? [], {
      api: mocks.api,
      browser: mocks.browser,
      session: SESSION,
      writeApi: mocks.writeApi,
    });

    expect(result.error).toBeUndefined();
    expect(mocks.apiCalls).toContain(
      `POST /api/inpatient/admissions/${PREVIOUS_ADMISSION_ID}/discharge`,
    );
    const prep = result.observations.find((o) => o.kind === 'fixture_prep');
    expect(prep?.payload).toMatchObject({ alreadyAdmitted: true, dischargedPrevious: true });
  });

  it('falla accionable sin camas disponibles', async () => {
    const scenario = loadScenario('admission-discharge-001');
    const mocks = makeRoutedAdapters((method, path) => {
      if (method === 'GET' && path.startsWith('/api/dashboard/service')) {
        return ok(200, {
          census: [{ bedId: 'b1', status: 'occupied', patientId: 'otro', admissionId: 'x' }],
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
    expect(result.error).toContain('Sin camas disponibles');
  });
});
