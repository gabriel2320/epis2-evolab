import type { ScenarioObservation } from '../evaluators/types.js';
import type { Epis2ApiTargetAdapter } from '../target/types.js';
import { resolveDemoPersona } from '../resources/demo-users.js';

/** Captura eventos de auditoría post-run (persona auditor) como observación audit_trail. */
export async function captureAuditTrail(
  api: Epis2ApiTargetAdapter,
  writeApi: (label: string, payload: Record<string, unknown>) => string,
): Promise<ScenarioObservation> {
  try {
    const auditor = resolveDemoPersona('auditor');
    const session = await api.login(auditor.username, auditor.demoAuthKey);
    const res = await api.apiRequest(session, 'GET', '/api/audit/events?limit=80');
    writeApi('audit-events-post-run', { status: res.status, ok: res.ok, body: res.body });
    const body = res.body as { events?: unknown[] } | null;
    return {
      kind: 'audit_trail',
      label: 'post_run_events',
      payload: {
        status: res.status,
        eventCount: body?.events?.length ?? 0,
        events: body?.events ?? [],
      },
    };
  } catch (err) {
    return {
      kind: 'audit_trail',
      label: 'post_run_events',
      payload: {
        error: err instanceof Error ? err.message : String(err),
        events: [],
      },
    };
  }
}
