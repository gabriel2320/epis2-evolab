import type { ScenarioDefinition } from '../contracts/schemas.js';
import {
  type DeclarativeStep,
  isApiStep,
  isBrowserStep,
  isCustomStep,
  isLoginStep,
} from '../step-engine/schema.js';
import { CUSTOM_STEP_COVERAGE } from '../fitness/coverage-catalog.js';

export const PLACEHOLDER_RE = /\{([a-zA-Z0-9_]+)\}/g;

/**
 * Captures conocidos que aportan los custom steps del catálogo
 * (step-engine/custom-steps.ts). Extender al añadir custom steps con capture.
 */
export const CUSTOM_STEP_CAPTURES: Record<string, string[]> = {
  find_available_bed: ['bedId'],
  mar_dashboard: ['marBody'],
};

export function extractPlaceholders(template: string): string[] {
  const found: string[] = [];
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    if (match[1]) found.push(match[1]);
  }
  return found;
}

/** Contexto base del step-engine: claves de fixture + demo case + today. */
export function baseContextKeys(scenario: ScenarioDefinition): Set<string> {
  const keys = new Set<string>(Object.keys(scenario.fixture ?? {}));
  if (typeof scenario.fixture?.demoCaseCode === 'string') {
    keys.add('patientId');
    keys.add('encounterId');
  }
  keys.add('today');
  return keys;
}

/** Claves de contexto que un paso añade tras ejecutarse (capture). */
export function stepContextAdditions(step: DeclarativeStep): string[] {
  if (isApiStep(step) && step.api.capture) {
    return Object.keys(step.api.capture);
  }
  if (isCustomStep(step)) {
    return CUSTOM_STEP_CAPTURES[step.custom.name] ?? [];
  }
  return [];
}

export type PlaceholderUse = {
  field: string;
  key: string;
};

function collectBodyPlaceholders(
  body: Record<string, unknown>,
  prefix: string,
  uses: PlaceholderUse[],
): void {
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') {
      for (const placeholder of extractPlaceholders(value)) {
        uses.push({ field: `${prefix}.${key}`, key: placeholder });
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      collectBodyPlaceholders(value as Record<string, unknown>, `${prefix}.${key}`, uses);
    }
  }
}

/** Placeholders `{x}` que el step-engine resolverá (y romperán el run si faltan). */
export function stepPlaceholderUses(step: DeclarativeStep): PlaceholderUse[] {
  const uses: PlaceholderUse[] = [];
  if (isApiStep(step)) {
    for (const key of extractPlaceholders(step.api.path)) {
      uses.push({ field: 'api.path', key });
    }
    if (step.api.body) {
      collectBodyPlaceholders(step.api.body, 'api.body', uses);
    }
    if (step.api.failOnMissingCapture) {
      for (const key of extractPlaceholders(step.api.failOnMissingCapture)) {
        // El engine interpola {status} de la respuesta — no es contexto previo.
        if (key !== 'status') uses.push({ field: 'api.failOnMissingCapture', key });
      }
    }
  } else if (isBrowserStep(step)) {
    if (step.browser.open) {
      for (const key of extractPlaceholders(step.browser.open)) {
        uses.push({ field: 'browser.open', key });
      }
    }
    for (const value of Object.values(step.browser.payload ?? {})) {
      for (const key of extractPlaceholders(value)) {
        uses.push({ field: 'browser.payload', key });
      }
    }
  }
  return uses;
}

/** Label identificable de un paso (para mensajes y puntos de inserción). */
export function stepLabel(step: DeclarativeStep, index: number): string {
  if (isLoginStep(step)) return step.login?.label ?? `login@${index}`;
  if (isApiStep(step)) return step.api.label;
  if (isBrowserStep(step)) return step.browser.label ?? `browser@${index}`;
  if (isCustomStep(step)) return step.custom.name;
  return `wait@${index}`;
}

/**
 * Labels de observación válidos para `actionObservation`: labels api (con
 * `observe.label` si lo sobreescribe), labels browser y labels de custom steps
 * (default del catálogo o `args.label`).
 */
export function observationLabels(scenario: ScenarioDefinition): Set<string> {
  const labels = new Set<string>();
  for (const step of scenario.flow ?? []) {
    if (isApiStep(step)) {
      labels.add(step.api.observe?.label ?? step.api.label);
    } else if (isBrowserStep(step) && step.browser.label) {
      labels.add(step.browser.label);
    } else if (isCustomStep(step)) {
      const argLabel = step.custom.args?.label;
      if (typeof argLabel === 'string') labels.add(argLabel);
      for (const label of CUSTOM_STEP_COVERAGE[step.custom.name]?.observationLabels ?? []) {
        labels.add(label);
      }
    } else if (isLoginStep(step) && step.login?.label) {
      labels.add(step.login.label);
    }
  }
  return labels;
}

/**
 * Placeholders disponibles inmediatamente después del paso con label
 * `afterLabel` (contexto base + captures previos, incluido ese paso). El motor
 * calcula esta lista determinísticamente — nunca el LLM (spec §2.3).
 */
export function availablePlaceholdersAfter(
  scenario: ScenarioDefinition,
  afterLabel: string,
): string[] {
  const keys = baseContextKeys(scenario);
  for (const [index, step] of (scenario.flow ?? []).entries()) {
    for (const key of stepContextAdditions(step)) {
      keys.add(key);
    }
    if (stepLabel(step, index) === afterLabel) break;
  }
  return [...keys].sort();
}
