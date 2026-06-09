import { getDemoCaseByCode } from '@evolab/demo-fixtures';
import type { ScenarioDefinition } from '../contracts/schemas.js';
import type { Epis2ApiTargetAdapter, Epis2BrowserTargetAdapter, TargetSession } from '../target/types.js';
import type { RunEvidenceBundle } from '../evidence/collector.js';
import type { ScenarioObservation } from '../evaluators/types.js';

const SERVICE_UNIT = 'CIRUGIA-DEMO';

type CriticalRow = { id: string; patientId: string; label: string };

function extractUnacknowledgedCriticals(
  body: unknown,
  patientId: string,
): { count: number; items: CriticalRow[] } {
  if (!body || typeof body !== 'object') return { count: 0, items: [] };
  const list = (body as { unacknowledgedCriticals?: CriticalRow[] }).unacknowledgedCriticals;
  if (!Array.isArray(list)) return { count: 0, items: [] };
  const items = list.filter((c) => c.patientId === patientId);
  return { count: items.length, items };
}

function dischargeDraftBody() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    diagnoses: 'Alta demo Evolab — apendicectomía (sintético)',
    dischargeDate: today,
    hospitalizationSummary: 'Evolución favorable — demo sintético',
    dischargeMedications: 'Paracetamol 1 g c/8 h PRN (demo)',
    instructions: 'Control ambulatorio en 7 días (demo)',
    followUpPlan: 'Control cirugía general en 7 días',
  };
}

async function fetchServiceCriticals(
  api: Epis2ApiTargetAdapter,
  session: TargetSession,
  patientId: string,
  writeApi: (label: string, payload: Record<string, unknown>) => string,
  label: string,
): Promise<ScenarioObservation> {
  const res = await api.apiRequest(session, 'GET', `/api/dashboard/service?unit=${SERVICE_UNIT}`);
  writeApi(`service-dashboard-${label}`, {
    status: res.status,
    ok: res.ok,
    body: res.body,
  });
  const { count, items } = extractUnacknowledgedCriticals(res.body, patientId);
  return {
    kind: 'sandbox_critical',
    label,
    payload: {
      hasUnacknowledgedCritical: count > 0,
      count,
      criticalIds: items.map((i) => i.id),
      labels: items.map((i) => i.label),
    },
  };
}

async function fetchDischargeAlerts(
  api: Epis2ApiTargetAdapter,
  session: TargetSession,
  patientId: string,
  writeApi: (label: string, payload: Record<string, unknown>) => string,
  label: string,
  fields?: Record<string, string>,
): Promise<ScenarioObservation> {
  const fieldsQuery =
    fields && Object.keys(fields).length > 0
      ? `&fields=${encodeURIComponent(JSON.stringify(fields))}`
      : '';
  const res = await api.apiRequest(
    session,
    'GET',
    `/api/patients/${patientId}/clinical-alerts?blueprintId=discharge_summary${fieldsQuery}`,
  );
  writeApi(`clinical-alerts-${label}`, {
    status: res.status,
    ok: res.ok,
    body: res.body,
  });
  const alertsBody = res.body as { alerts?: unknown[] } | null;
  return {
    kind: 'clinical_alerts_api',
    label,
    payload: {
      status: res.status,
      alertCount: alertsBody?.alerts?.length ?? 0,
      alerts: alertsBody?.alerts ?? [],
    },
  };
}

async function probeBrowserDischargeUi(
  browser: Epis2BrowserTargetAdapter,
  patientId: string,
): Promise<ScenarioObservation> {
  try {
    await browser.open(`/espacio/epicrisis?patientId=${patientId}`);
    const formVisible = await browser.waitForTestId('epis2-generated-clinical-page', 12_000);
    const clinicalAlertsPanelVisible = formVisible
      ? await browser.waitForTestId('epis2-clinical-alerts', 8_000)
      : false;
    const criticalAlertVisible = await browser.isVisible(
      'epis2-clinical-alert-critical_lab_without_ack',
    );
    const signDisabled = formVisible ? !(await browser.isVisible('epis2-form-sign')) : true;
    if (formVisible) {
      await browser.screenshot('02-discharge-form-ui-probe');
    } else {
      await browser.screenshot('02-discharge-ui-unavailable');
    }
    return {
      kind: 'dom_state',
      label: 'discharge_form',
      payload: {
        formVisible,
        clinicalAlertsPanelVisible,
        criticalAlertVisible,
        signDisabled,
        browserProbe: true,
        url: await browser.currentUrl(),
      },
    };
  } catch (err) {
    return {
      kind: 'dom_state',
      label: 'discharge_form',
      payload: {
        formVisible: false,
        browserProbe: true,
        browserUnavailable: true,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export async function executeDischargeCriticalPending001(
  scenario: ScenarioDefinition,
  api: Epis2ApiTargetAdapter,
  browser: Epis2BrowserTargetAdapter,
  session: TargetSession,
  _evidence: RunEvidenceBundle,
  writeApi: (label: string, payload: Record<string, unknown>) => string,
): Promise<{ observations: ScenarioObservation[]; error?: string }> {
  const observations: ScenarioObservation[] = [];
  const fixture = scenario.fixture as Record<string, unknown> | undefined;
  const demoCode = String(fixture?.demoCaseCode ?? 'DEMO-004');
  const demo = getDemoCaseByCode(demoCode);
  if (!demo) {
    return { observations, error: `demoCaseCode desconocido: ${demoCode}` };
  }

  observations.push({
    kind: 'session',
    label: 'login_physician',
    payload: { username: session.username, role: session.role, synthetic: true },
  });

  observations.push(
    await fetchServiceCriticals(api, session, demo.patientId, writeApi, 'unacknowledged_criticals'),
  );

  const draftFields = dischargeDraftBody();
  observations.push(
    await fetchDischargeAlerts(api, session, demo.patientId, writeApi, 'discharge_alerts', {
      diagnoses: draftFields.diagnoses,
      hospitalizationSummary: draftFields.hospitalizationSummary,
      dischargeMedications: draftFields.dischargeMedications,
      instructions: draftFields.instructions,
    }),
  );

  const createRes = await api.apiRequest(session, 'POST', '/api/drafts', {
    patientId: demo.patientId,
    encounterId: demo.encounterId,
    draftType: 'discharge_summary',
    title: 'Epicrisis — Evolab sintético',
    body: draftFields,
  });
  writeApi('discharge-draft-create', {
    status: createRes.status,
    ok: createRes.ok,
    body: createRes.body,
  });

  const createBody = createRes.body as { draft?: { id: string } } | null;
  const draftId = createBody?.draft?.id;
  if (!createRes.ok || !draftId) {
    return {
      observations,
      error: `No se pudo crear borrador de alta (HTTP ${createRes.status})`,
    };
  }

  observations.push({
    kind: 'api_response',
    label: 'discharge_draft_create',
    payload: { status: createRes.status, ok: createRes.ok, draftId },
  });

  observations.push(await probeBrowserDischargeUi(browser, demo.patientId));

  const approveAttempt = await api.apiRequest(
    session,
    'POST',
    `/api/drafts/${draftId}/approve`,
  );
  writeApi('discharge-approve-attempt', {
    status: approveAttempt.status,
    ok: approveAttempt.ok,
    body: approveAttempt.body,
  });
  observations.push({
    kind: 'api_response',
    label: 'discharge_approve_attempt',
    payload: {
      status: approveAttempt.status,
      ok: approveAttempt.ok,
      draftId,
    },
  });

  observations.push(
    await fetchServiceCriticals(api, session, demo.patientId, writeApi, 'after_discharge_attempt'),
  );

  return { observations };
}
