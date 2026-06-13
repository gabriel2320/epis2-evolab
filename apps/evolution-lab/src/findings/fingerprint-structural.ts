import { createHash } from 'node:crypto';
import type { ScenarioDefinition } from '../contracts/schemas.js';
import { isApiStep, isBrowserStep, isCustomStep, isLoginStep } from '../step-engine/schema.js';

function sortedDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortedDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function flowStructuralKeys(scenario: ScenarioDefinition): string[] {
  const keys: string[] = [];
  for (const step of scenario.flow ?? []) {
    if (isLoginStep(step)) {
      keys.push(`login:${step.login?.label ?? 'login'}`);
    } else if (isApiStep(step)) {
      keys.push(`api:${step.api.method}:${step.api.path}`);
    } else if (isBrowserStep(step)) {
      keys.push(`browser:${step.browser.open ?? step.browser.label ?? 'open'}`);
    } else if (isCustomStep(step)) {
      keys.push(`custom:${step.custom.name}`);
    }
  }
  return keys.sort();
}

/**
 * Firma estructural estable (sin id/name de mutante) para dedup S14.1.
 * Misma forma de flow + expected + rol ⇒ mismo cluster de fallo clínico.
 */
export function computeScenarioStructuralSignature(scenario: ScenarioDefinition): string {
  const parts = [
    scenario.persona.role,
    JSON.stringify(sortedDeep(scenario.expected ?? {})),
    JSON.stringify(sortedDeep(scenario.fixture ?? {})),
    flowStructuralKeys(scenario).join(','),
    [...(scenario.evaluators ?? [])].sort().join(','),
    scenario.expected.actionBlocked === true ? 'blocked' : 'allowed',
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

/** Base del escenario humano antes del sufijo MAP-Elites (`-m8cx-008`). */
export function extractBaseScenarioId(scenarioId: string): string {
  return scenarioId.replace(/-m[a-z0-9]+-\d+$/i, '');
}
