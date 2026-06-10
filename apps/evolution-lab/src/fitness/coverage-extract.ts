import type { ScenarioDefinition } from '../contracts/schemas.js';
import type { ScenarioObservation } from '../evaluators/types.js';
import { isApiStep, isCustomStep, isLoginStep } from '../step-engine/schema.js';
import {
  CUSTOM_STEP_COVERAGE,
  endpointKey,
  resolveEndpointKey,
  type HttpMethod,
} from './coverage-catalog.js';

export type RunCoverage = {
  /** Claves `METHOD /path/canonico` tocadas. */
  endpoints: string[];
  /** eventTypes de auditoría observados/declarados (únicos). */
  auditEvents: string[];
};

const LOGIN_ENDPOINT = endpointKey('POST', '/api/auth/login');
const AUDIT_EVENTS_ENDPOINT = endpointKey('GET', '/api/audit/events');

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function customStepLabels(stepName: string, args: Record<string, unknown>): string[] {
  if (typeof args.label === 'string' && args.label.length > 0) return [args.label];
  return CUSTOM_STEP_COVERAGE[stepName]?.observationLabels ?? [];
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

/**
 * Cobertura efectiva de un run completado (S7.2): cruza las observaciones que
 * emitió el step-engine con el `flow:` del escenario para derivar qué
 * endpoints (method + path canónico) y qué eventos de auditoría se tocaron.
 *
 * - Pasos `api`: cubiertos si su label (u `observe.label`) aparece como observación.
 * - Pasos `custom`: cubiertos si emitieron alguna de sus observaciones conocidas;
 *   sus endpoints vienen del catálogo (CUSTOM_STEP_COVERAGE).
 * - Login y captura de auditoría son implícitos (observaciones `session` / `audit_trail`).
 */
export function extractRunCoverage(
  scenario: ScenarioDefinition,
  observations: ScenarioObservation[],
): RunCoverage {
  const labels = new Set(observations.map((o) => o.label));
  const endpoints = new Set<string>();
  const auditEvents = new Set<string>();

  for (const step of scenario.flow ?? []) {
    if (isApiStep(step)) {
      const observedLabel = step.api.observe?.label ?? step.api.label;
      if (labels.has(observedLabel)) {
        endpoints.add(resolveEndpointKey(step.api.method as HttpMethod, step.api.path));
      }
    } else if (isCustomStep(step)) {
      const coverage = CUSTOM_STEP_COVERAGE[step.custom.name];
      if (!coverage) continue;
      const stepLabels = customStepLabels(step.custom.name, step.custom.args ?? {});
      if (stepLabels.some((l) => labels.has(l))) {
        for (const e of coverage.endpoints) {
          endpoints.add(resolveEndpointKey(e.method, e.path));
        }
      }
    }
  }

  if (observations.some((o) => o.kind === 'session')) {
    endpoints.add(LOGIN_ENDPOINT);
  }

  const trail = observations.find((o) => o.kind === 'audit_trail');
  if (trail) {
    endpoints.add(AUDIT_EVENTS_ENDPOINT);
    const events = Array.isArray(trail.payload.events) ? trail.payload.events : [];
    for (const event of events) {
      const eventType = (event as { eventType?: unknown }).eventType;
      if (typeof eventType === 'string' && eventType.length > 0) {
        auditEvents.add(eventType);
      }
    }
  }

  return { endpoints: sortedUnique(endpoints), auditEvents: sortedUnique(auditEvents) };
}

/**
 * Cobertura declarada de un escenario desde su YAML estático (sin ejecutar):
 * pasos `api` y `custom` del flow + login + auditoría esperada. Base del mapa
 * de cobertura del comando `fitness report`.
 */
export function extractScenarioStaticCoverage(scenario: ScenarioDefinition): RunCoverage {
  const endpoints = new Set<string>();
  const auditEvents = new Set<string>();

  for (const step of scenario.flow ?? []) {
    if (isApiStep(step)) {
      endpoints.add(resolveEndpointKey(step.api.method as HttpMethod, step.api.path));
    } else if (isCustomStep(step)) {
      for (const e of CUSTOM_STEP_COVERAGE[step.custom.name]?.endpoints ?? []) {
        endpoints.add(resolveEndpointKey(e.method, e.path));
      }
    } else if (isLoginStep(step)) {
      endpoints.add(LOGIN_ENDPOINT);
    }
  }

  const mustInclude = stringArray(scenario.expected.auditMustInclude);
  const capturesAudit = scenario.expected.auditEventCreated === true || mustInclude.length > 0;
  if (capturesAudit) {
    endpoints.add(AUDIT_EVENTS_ENDPOINT);
    for (const eventType of mustInclude) {
      auditEvents.add(eventType);
    }
  }

  return { endpoints: sortedUnique(endpoints), auditEvents: sortedUnique(auditEvents) };
}
