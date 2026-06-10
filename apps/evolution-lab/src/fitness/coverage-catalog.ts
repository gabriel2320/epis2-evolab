/**
 * Catálogo de cobertura EPIS2 (Sprint 7 — fitness).
 *
 * Data-driven: enumera los endpoints API y eventos de auditoría de EPIS2 que
 * Evolab considera relevantes para medir cobertura del corpus de escenarios.
 * Fuente: apps/api/src/{auth,clinical,inpatient,dashboard,audit}/routes.ts del
 * repo EPIS2 + eventos `eventType` emitidos por el API. Extender añadiendo
 * entradas; ningún módulo de fitness hardcodea rutas fuera de este archivo.
 */

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type CatalogEndpoint = {
  method: HttpMethod;
  /** Path canónico con placeholders estilo `:id` (sin query string). */
  path: string;
  module: 'auth' | 'clinical' | 'inpatient' | 'dashboard' | 'audit';
};

export type CatalogAuditEvent = {
  eventType: string;
  module: 'auth' | 'clinical' | 'inpatient' | 'dashboard' | 'commands' | 'admin';
};

export const ENDPOINT_CATALOG: CatalogEndpoint[] = [
  // auth
  { method: 'POST', path: '/api/auth/login', module: 'auth' },
  { method: 'POST', path: '/api/auth/logout', module: 'auth' },
  { method: 'GET', path: '/api/auth/session', module: 'auth' },
  // clinical
  { method: 'GET', path: '/api/patients', module: 'clinical' },
  { method: 'GET', path: '/api/patients/:patientId', module: 'clinical' },
  { method: 'GET', path: '/api/patients/:patientId/clinical-alerts', module: 'clinical' },
  { method: 'GET', path: '/api/patients/:patientId/results-inbox', module: 'clinical' },
  { method: 'GET', path: '/api/patients/:patientId/longitudinal', module: 'clinical' },
  { method: 'POST', path: '/api/drafts', module: 'clinical' },
  { method: 'GET', path: '/api/drafts', module: 'clinical' },
  { method: 'GET', path: '/api/drafts/:draftId', module: 'clinical' },
  { method: 'PATCH', path: '/api/drafts/:draftId', module: 'clinical' },
  { method: 'POST', path: '/api/drafts/:draftId/approve', module: 'clinical' },
  // inpatient
  { method: 'POST', path: '/api/inpatient/admissions', module: 'inpatient' },
  { method: 'POST', path: '/api/inpatient/admissions/:admissionId/transfer', module: 'inpatient' },
  { method: 'POST', path: '/api/inpatient/admissions/:admissionId/discharge', module: 'inpatient' },
  {
    method: 'POST',
    path: '/api/inpatient/critical-results/:criticalId/acknowledge',
    module: 'inpatient',
  },
  // dashboard
  { method: 'GET', path: '/api/dashboard/service', module: 'dashboard' },
  { method: 'GET', path: '/api/dashboard/nursing', module: 'dashboard' },
  { method: 'GET', path: '/api/dashboard/work', module: 'dashboard' },
  { method: 'GET', path: '/api/dashboard/patient/:patientId', module: 'dashboard' },
  { method: 'GET', path: '/api/dashboard/quality', module: 'dashboard' },
  // audit
  { method: 'GET', path: '/api/audit/events', module: 'audit' },
];

export const AUDIT_EVENT_CATALOG: CatalogAuditEvent[] = [
  { eventType: 'auth.login.success', module: 'auth' },
  { eventType: 'auth.login.failure', module: 'auth' },
  { eventType: 'auth.logout', module: 'auth' },
  { eventType: 'clinical.draft.created', module: 'clinical' },
  { eventType: 'clinical.draft.approved', module: 'clinical' },
  { eventType: 'clinical.encounter.closed', module: 'clinical' },
  { eventType: 'inpatient.admitted', module: 'inpatient' },
  { eventType: 'inpatient.transferred', module: 'inpatient' },
  { eventType: 'inpatient.discharged', module: 'inpatient' },
  { eventType: 'critical.acknowledged', module: 'inpatient' },
  { eventType: 'dashboard.opened', module: 'dashboard' },
  { eventType: 'command.resolve', module: 'commands' },
];

/**
 * Endpoints que toca cada custom step del step-engine (custom-steps.ts) y los
 * labels de observación con los que se detecta su ejecución en un run.
 * `observationLabels` son los defaults; `args.label` del YAML tiene prioridad.
 */
export type CustomStepCoverage = {
  endpoints: Array<{ method: HttpMethod; path: string }>;
  observationLabels: string[];
};

export const CUSTOM_STEP_COVERAGE: Record<string, CustomStepCoverage> = {
  ensure_patient_not_admitted: {
    endpoints: [
      { method: 'GET', path: '/api/dashboard/service' },
      { method: 'POST', path: '/api/inpatient/admissions/:admissionId/discharge' },
    ],
    observationLabels: ['ensure_not_admitted'],
  },
  find_available_bed: {
    endpoints: [{ method: 'GET', path: '/api/dashboard/service' }],
    observationLabels: ['available_bed'],
  },
  census_snapshot: {
    endpoints: [{ method: 'GET', path: '/api/dashboard/service' }],
    observationLabels: ['census_snapshot'],
  },
  service_criticals: {
    endpoints: [{ method: 'GET', path: '/api/dashboard/service' }],
    observationLabels: ['unacknowledged_criticals'],
  },
  discharge_alerts: {
    endpoints: [{ method: 'GET', path: '/api/patients/:patientId/clinical-alerts' }],
    observationLabels: ['discharge_alerts'],
  },
  discharge_ui_probe: {
    endpoints: [],
    observationLabels: [],
  },
  mar_dashboard: {
    endpoints: [{ method: 'GET', path: '/api/dashboard/nursing' }],
    observationLabels: ['scheduled_mar'],
  },
  mar_alerts: {
    endpoints: [{ method: 'GET', path: '/api/patients/:patientId/clinical-alerts' }],
    observationLabels: ['mar_alerts'],
  },
  mar_create_and_approve: {
    endpoints: [
      { method: 'POST', path: '/api/drafts' },
      { method: 'POST', path: '/api/drafts/:draftId/approve' },
    ],
    observationLabels: ['mar_draft_create', 'mar_approve_attempt'],
  },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normaliza un path API a forma canónica comparable con el catálogo:
 * sin query string y con segmentos variables (`{placeholder}`, UUIDs, números)
 * reemplazados por `:id`.
 */
export function normalizeApiPath(rawPath: string): string {
  const withoutQuery = rawPath.split('?')[0] ?? rawPath;
  const segments = withoutQuery.split('/').map((segment) => {
    if (segment.startsWith('{') && segment.endsWith('}')) return ':id';
    if (segment.startsWith(':')) return segment;
    if (UUID_RE.test(segment)) return ':id';
    if (/^\d+$/.test(segment)) return ':id';
    return segment;
  });
  return segments.join('/');
}

/** Clave estable de cobertura: `METHOD /path/canonico`. */
export function endpointKey(method: HttpMethod, path: string): string {
  return `${method} ${path}`;
}

function segmentsMatch(catalogPath: string, normalizedPath: string): boolean {
  const catalogSegments = catalogPath.split('/');
  const pathSegments = normalizedPath.split('/');
  if (catalogSegments.length !== pathSegments.length) return false;
  return catalogSegments.every((seg, i) => {
    if (seg.startsWith(':')) return true;
    const other = pathSegments[i] ?? '';
    return seg === other || other.startsWith(':');
  });
}

/**
 * Resuelve un method+path observado contra el catálogo. Si hay match devuelve
 * la clave canónica del catálogo; si no, la clave normalizada (cobertura fuera
 * de catálogo, igualmente registrada).
 */
export function resolveEndpointKey(method: HttpMethod, rawPath: string): string {
  const normalized = normalizeApiPath(rawPath);
  const match = ENDPOINT_CATALOG.find(
    (e) => e.method === method && segmentsMatch(e.path, normalized),
  );
  return match ? endpointKey(match.method, match.path) : endpointKey(method, normalized);
}
