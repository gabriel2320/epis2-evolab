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

const registry: Record<string, CustomStepFn> = {
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
