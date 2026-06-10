import { getDemoCaseByCode } from '@evolab/demo-fixtures';
import type { ScenarioDefinition } from '../contracts/schemas.js';
import type {
  Epis2ApiTargetAdapter,
  Epis2BrowserTargetAdapter,
  TargetSession,
} from '../target/types.js';
import type { RunEvidenceBundle } from '../evidence/collector.js';
import type { ScenarioObservation } from '../evaluators/types.js';

type MarDose = {
  id: string;
  medication: string;
  status: string;
  patientId: string;
  requiresDoubleCheck?: boolean;
};

function findTargetDose(
  body: unknown,
  patientId: string,
  medicationHint?: string,
): MarDose | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const list = (body as { scheduledMar?: MarDose[] }).scheduledMar;
  if (!Array.isArray(list)) return undefined;
  const forPatient = list.filter((d) => d.patientId === patientId);
  if (medicationHint) {
    const hint = medicationHint.toLowerCase();
    return forPatient.find((d) => d.medication.toLowerCase().includes(hint)) ?? forPatient[0];
  }
  return forPatient[0];
}

export async function executeSuspendedMedicationMar001(
  scenario: ScenarioDefinition,
  api: Epis2ApiTargetAdapter,
  _browser: Epis2BrowserTargetAdapter,
  session: TargetSession,
  _evidence: RunEvidenceBundle,
  writeApi: (label: string, payload: Record<string, unknown>) => string,
): Promise<{ observations: ScenarioObservation[]; error?: string }> {
  const observations: ScenarioObservation[] = [];
  const fixture = scenario.fixture as Record<string, unknown> | undefined;
  const demoCode = String(fixture?.demoCaseCode ?? 'DEMO-005');
  const medicationHint = String(fixture?.medicationHint ?? 'Warfarina');
  const demo = getDemoCaseByCode(demoCode);
  if (!demo) {
    return { observations, error: `demoCaseCode desconocido: ${demoCode}` };
  }

  observations.push({
    kind: 'session',
    label: 'login_nurse',
    payload: { username: session.username, role: session.role, synthetic: true },
  });

  const nursingRes = await api.apiRequest(session, 'GET', '/api/dashboard/nursing');
  writeApi('nursing-dashboard', {
    status: nursingRes.status,
    ok: nursingRes.ok,
    body: nursingRes.body,
  });

  const targetDose = findTargetDose(nursingRes.body, demo.patientId, medicationHint);
  const fixtureHeld = fixture?.medicationStatus === 'suspended' || fixture?.marDoseHeld === true;
  observations.push({
    kind: 'nursing_dashboard',
    label: 'scheduled_mar',
    payload: {
      status: nursingRes.status,
      targetDoseId: targetDose?.id ?? fixture?.marDoseId,
      targetMedication: targetDose?.medication ?? medicationHint,
      targetDoseStatus: targetDose?.status ?? (fixtureHeld ? 'held' : 'unknown'),
      targetDoseHeld: targetDose?.status === 'held' || fixtureHeld,
      requiresDoubleCheck: targetDose?.requiresDoubleCheck ?? false,
      dashboardListed: Boolean(targetDose),
    },
  });

  const marBody = {
    medication: targetDose?.medication ?? medicationHint,
    dose: targetDose ? '5 mg' : '1 g',
    route: 'VO',
    doubleCheckConfirmed: true,
    medication_order_id: targetDose?.id,
  };

  const alertsRes = await api.apiRequest(
    session,
    'GET',
    `/api/patients/${demo.patientId}/clinical-alerts?blueprintId=medication_administration&fields=${encodeURIComponent(JSON.stringify(marBody))}`,
  );
  writeApi('clinical-alerts-mar', {
    status: alertsRes.status,
    ok: alertsRes.ok,
    body: alertsRes.body,
  });
  const alertsBody = alertsRes.body as { alerts?: unknown[] } | null;
  observations.push({
    kind: 'clinical_alerts_api',
    label: 'mar_alerts',
    payload: {
      status: alertsRes.status,
      alertCount: alertsBody?.alerts?.length ?? 0,
      alerts: alertsBody?.alerts ?? [],
    },
  });

  const createRes = await api.apiRequest(session, 'POST', '/api/drafts', {
    patientId: demo.patientId,
    encounterId: demo.encounterId,
    draftType: 'medication_administration',
    title: 'MAR Evolab — dosis held (sintético)',
    body: marBody,
  });
  writeApi('mar-draft-create', {
    status: createRes.status,
    ok: createRes.ok,
    body: createRes.body,
  });

  const createBody = createRes.body as { draft?: { id: string } } | null;
  const draftId = createBody?.draft?.id;
  if (!createRes.ok || !draftId) {
    observations.push({
      kind: 'api_response',
      label: 'mar_approve_attempt',
      payload: { status: createRes.status, ok: false, error: 'draft_no_creado' },
    });
    return { observations };
  }

  observations.push({
    kind: 'api_response',
    label: 'mar_draft_create',
    payload: { status: createRes.status, ok: createRes.ok, draftId },
  });

  const approveAttempt = await api.apiRequest(session, 'POST', `/api/drafts/${draftId}/approve`);
  writeApi('mar-approve-attempt', {
    status: approveAttempt.status,
    ok: approveAttempt.ok,
    body: approveAttempt.body,
  });
  observations.push({
    kind: 'api_response',
    label: 'mar_approve_attempt',
    payload: {
      status: approveAttempt.status,
      ok: approveAttempt.ok,
      draftId,
    },
  });

  return { observations };
}
