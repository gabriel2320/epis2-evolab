import { getDemoCaseByCode } from '@evolab/demo-fixtures';
import type { ScenarioDefinition } from '../contracts/schemas.js';
import type {
  Epis2ApiTargetAdapter,
  Epis2BrowserTargetAdapter,
  TargetSession,
} from '../target/types.js';
import type { ScenarioObservation } from '../evaluators/types.js';
import {
  dischargeDraftBody,
  fetchDischargeAlerts,
  fetchServiceCriticals,
  probeBrowserDischargeUi,
} from '../scenarios/discharge-critical-pending.js';
import {
  marAlertsObservation,
  marCreateAndApprove,
  marDashboardObservation,
  type MarBody,
} from '../scenarios/suspended-medication-mar.js';

export type CustomStepResult = {
  observations: ScenarioObservation[];
  capture?: Record<string, unknown>;
  error?: string;
};

export type CustomStepFn = (input: {
  scenario: ScenarioDefinition;
  api: Epis2ApiTargetAdapter;
  browser: Epis2BrowserTargetAdapter;
  session: TargetSession;
  writeApi: (label: string, payload: Record<string, unknown>) => string;
  ctx: Record<string, unknown>;
  args: Record<string, unknown>;
}) => Promise<CustomStepResult>;

function requirePatientId(ctx: Record<string, unknown>): string {
  const patientId = ctx.patientId;
  if (typeof patientId !== 'string' || patientId.length === 0) {
    throw new Error('Contexto sin patientId (verificar fixture.demoCaseCode)');
  }
  return patientId;
}

type CensusBedRow = {
  bedId?: string;
  status?: string;
  patientId?: string;
  admissionId?: string;
};

async function fetchCensus(
  api: Epis2ApiTargetAdapter,
  session: TargetSession,
  unit: string,
): Promise<{ status: number; census: CensusBedRow[]; body: unknown }> {
  const res = await api.apiRequest(
    session,
    'GET',
    `/api/dashboard/service?unit=${encodeURIComponent(unit)}`,
  );
  const body = res.body as { census?: CensusBedRow[] } | null;
  return { status: res.status, census: Array.isArray(body?.census) ? body.census : [], body };
}

const registry: Record<string, CustomStepFn> = {
  /**
   * Journey precondición: si el paciente del contexto ya está admitido, lo da de alta
   * para que la admisión del journey parta de estado limpio (idempotente). args: { label, unit }
   */
  ensure_patient_not_admitted: async ({ api, session, writeApi, ctx, args }) => {
    const label = typeof args.label === 'string' ? args.label : 'ensure_not_admitted';
    const unit = typeof args.unit === 'string' ? args.unit : 'CIRUGIA-DEMO';
    const patientId = requirePatientId(ctx);

    const { status, census, body } = await fetchCensus(api, session, unit);
    writeApi(`census-${label}`, { status, body });
    if (status !== 200) {
      return { observations: [], error: `Censo no disponible (HTTP ${status})` };
    }

    const existing = census.find((b) => b.status === 'occupied' && b.patientId === patientId);
    if (!existing?.admissionId) {
      return {
        observations: [
          {
            kind: 'fixture_prep',
            label,
            payload: { alreadyAdmitted: false, dischargedPrevious: false },
          },
        ],
      };
    }

    const discharge = await api.apiRequest(
      session,
      'POST',
      `/api/inpatient/admissions/${existing.admissionId}/discharge`,
    );
    writeApi(`discharge-previous-${label}`, {
      status: discharge.status,
      ok: discharge.ok,
      body: discharge.body,
    });
    if (!discharge.ok) {
      return {
        observations: [],
        error: `No se pudo dar de alta admisión previa ${existing.admissionId} (HTTP ${discharge.status})`,
      };
    }
    return {
      observations: [
        {
          kind: 'fixture_prep',
          label,
          payload: {
            alreadyAdmitted: true,
            dischargedPrevious: true,
            previousAdmissionId: existing.admissionId,
          },
        },
      ],
    };
  },

  /** Busca una cama disponible en el censo y la captura como {bedId}. args: { label, unit } */
  find_available_bed: async ({ api, session, writeApi, args }) => {
    const label = typeof args.label === 'string' ? args.label : 'available_bed';
    const unit = typeof args.unit === 'string' ? args.unit : 'CIRUGIA-DEMO';

    const { status, census, body } = await fetchCensus(api, session, unit);
    writeApi(`census-${label}`, { status, body });
    if (status !== 200) {
      return { observations: [], error: `Censo no disponible (HTTP ${status})` };
    }

    const available = census.find((b) => b.status === 'available' && b.bedId);
    if (!available?.bedId) {
      return { observations: [], error: `Sin camas disponibles en ${unit} para el journey` };
    }
    return {
      observations: [
        {
          kind: 'census_lookup',
          label,
          payload: { status, bedId: available.bedId, bedCount: census.length },
        },
      ],
      capture: { bedId: available.bedId },
    };
  },

  /** Snapshot del censo del tablero de servicio con métricas de coherencia. args: { label, unit } */
  census_snapshot: async ({ api, session, writeApi, ctx, args }) => {
    const label = typeof args.label === 'string' ? args.label : 'census_snapshot';
    const unit = typeof args.unit === 'string' ? args.unit : 'CIRUGIA-DEMO';
    const res = await api.apiRequest(
      session,
      'GET',
      `/api/dashboard/service?unit=${encodeURIComponent(unit)}`,
    );
    writeApi(`census-${label}`, { status: res.status, ok: res.ok, body: res.body });

    const body = res.body as {
      census?: CensusBedRow[];
      unacknowledgedCriticals?: unknown[];
    } | null;
    const census = Array.isArray(body?.census) ? body.census : [];
    const occupied = census.filter((b) => b.status === 'occupied');
    const available = census.filter((b) => b.status === 'available');
    const occupiedWithoutPatient = occupied.filter((b) => !b.patientId).length;
    const occupiedWithoutAdmission = occupied.filter((b) => !b.admissionId).length;
    const availableWithPatient = available.filter((b) => Boolean(b.patientId)).length;
    const demoPatientListed =
      typeof ctx.patientId === 'string' && occupied.some((b) => b.patientId === ctx.patientId);

    return {
      observations: [
        {
          kind: 'census_snapshot',
          label,
          payload: {
            status: res.status,
            ok: res.ok,
            unit,
            bedCount: census.length,
            occupiedCount: occupied.length,
            availableCount: available.length,
            occupiedWithoutPatient,
            occupiedWithoutAdmission,
            availableWithPatient,
            demoPatientListed,
            unacknowledgedCriticalCount: body?.unacknowledgedCriticals?.length ?? 0,
          },
        },
      ],
    };
  },

  /** Conteo paginado de borradores del paciente (MR-03 idempotencia). args: { label } */
  drafts_count: async ({ api, session, writeApi, ctx, args }) => {
    const label = typeof args.label === 'string' ? args.label : 'drafts_count';
    const patientId = requirePatientId(ctx);
    const limit = 50;
    let offset = 0;
    let total = 0;

    for (;;) {
      const res = await api.apiRequest(
        session,
        'GET',
        `/api/drafts?patientId=${encodeURIComponent(patientId)}&limit=${limit}&offset=${offset}`,
      );
      writeApi(`drafts-count-${label}-${offset}`, {
        status: res.status,
        ok: res.ok,
        body: res.body,
      });
      if (!res.ok) {
        return {
          observations: [],
          error: `Listado de drafts no disponible (HTTP ${res.status})`,
        };
      }

      const body = res.body as { drafts?: unknown[] } | null;
      const page = Array.isArray(body?.drafts) ? body.drafts : [];
      total += page.length;
      if (page.length < limit) {
        return {
          observations: [
            {
              kind: 'drafts_count',
              label,
              payload: { status: res.status, ok: res.ok, total, patientId },
            },
          ],
        };
      }
      offset += limit;
    }
  },

  /** Críticos sin acuse del dashboard de servicio. args: { label } */
  service_criticals: async ({ api, session, writeApi, ctx, args }) => {
    const label = typeof args.label === 'string' ? args.label : 'unacknowledged_criticals';
    const observation = await fetchServiceCriticals(
      api,
      session,
      requirePatientId(ctx),
      writeApi,
      label,
    );
    return { observations: [observation] };
  },

  /** Alertas CDR del blueprint discharge_summary con campos del borrador demo. args: { label } */
  discharge_alerts: async ({ api, session, writeApi, ctx, args }) => {
    const label = typeof args.label === 'string' ? args.label : 'discharge_alerts';
    const draftFields = dischargeDraftBody();
    const observation = await fetchDischargeAlerts(
      api,
      session,
      requirePatientId(ctx),
      writeApi,
      label,
      {
        diagnoses: draftFields.diagnoses,
        hospitalizationSummary: draftFields.hospitalizationSummary,
        dischargeMedications: draftFields.dischargeMedications,
        instructions: draftFields.instructions,
      },
    );
    return { observations: [observation] };
  },

  /** Sonda UI de epicrisis (tolerante a browser no disponible). */
  discharge_ui_probe: async ({ browser, ctx }) => {
    const observation = await probeBrowserDischargeUi(browser, requirePatientId(ctx));
    return { observations: [observation] };
  },

  /** Dashboard enfermería + dosis objetivo; captura marBody para pasos siguientes. args: { label } */
  mar_dashboard: async ({ scenario, api, session, writeApi, ctx, args }) => {
    const label = typeof args.label === 'string' ? args.label : 'scheduled_mar';
    const fixture = (scenario.fixture ?? {}) as Record<string, unknown>;
    const { observation, marBody } = await marDashboardObservation(
      api,
      session,
      fixture,
      requirePatientId(ctx),
      writeApi,
      label,
    );
    return { observations: [observation], capture: { marBody } };
  },

  /** Alertas CDR del blueprint medication_administration. Requiere marBody capturado. args: { label } */
  mar_alerts: async ({ api, session, writeApi, ctx, args }) => {
    const label = typeof args.label === 'string' ? args.label : 'mar_alerts';
    const marBody = ctx.marBody as MarBody | undefined;
    if (!marBody) {
      return { observations: [], error: 'mar_alerts requiere paso previo mar_dashboard (marBody)' };
    }
    const observation = await marAlertsObservation(
      api,
      session,
      requirePatientId(ctx),
      marBody,
      writeApi,
      label,
    );
    return { observations: [observation] };
  },

  /** Crea borrador MAR y intenta approve; fallback observado si el create falla. */
  mar_create_and_approve: async ({ scenario, api, session, writeApi, ctx }) => {
    const marBody = ctx.marBody as MarBody | undefined;
    if (!marBody) {
      return {
        observations: [],
        error: 'mar_create_and_approve requiere paso previo mar_dashboard (marBody)',
      };
    }
    const fixture = (scenario.fixture ?? {}) as Record<string, unknown>;
    const demoCode = String(fixture.demoCaseCode ?? '');
    const demo = getDemoCaseByCode(demoCode);
    if (!demo) {
      return { observations: [], error: `demoCaseCode desconocido: ${demoCode}` };
    }
    const observations = await marCreateAndApprove(api, session, demo, marBody, writeApi);
    return { observations };
  },
};

export function getCustomStep(name: string): CustomStepFn | undefined {
  return registry[name];
}

export function listCustomSteps(): string[] {
  return Object.keys(registry).sort();
}
