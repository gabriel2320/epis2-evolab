import type { ScenarioObservation } from './types.js';

export type OutcomeKind = 'allowed' | 'blocked';

export function resolveApiObservation(
  observations: ScenarioObservation[],
  label: string,
): ScenarioObservation | undefined {
  return observations.find((o) => o.kind === 'api_response' && o.label === label);
}

export function classifyOutcome(obs?: ScenarioObservation): OutcomeKind | 'unknown' {
  if (!obs) return 'unknown';
  const status = typeof obs.payload.status === 'number' ? obs.payload.status : 0;
  if (status === 403 || status === 401 || status === 400 || status === 409 || status === 422) {
    return 'blocked';
  }
  if (obs.payload.ok === true) return 'allowed';
  return 'unknown';
}
