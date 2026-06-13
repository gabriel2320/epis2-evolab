/**
 * Perfiles de corrida Evolab (S13.2) — política browser/GPU por tipo de sesión.
 */
export const RUN_PROFILES = ['api-only', 'hybrid', 'visual-smoke'] as const;
export type RunProfile = (typeof RUN_PROFILES)[number];

const PROFILE_ENV = 'EPIS2_EVOLAB_RUN_PROFILE';

export function resolveRunProfile(raw = process.env[PROFILE_ENV]): RunProfile {
  const v = raw?.trim().toLowerCase();
  if (v === 'hybrid' || v === 'visual-smoke' || v === 'visual_smoke') {
    return v === 'visual_smoke' ? 'visual-smoke' : v;
  }
  if (v === 'api-only' || v === 'api_only' || v === 'api') return 'api-only';
  return 'api-only';
}

/** Aplica side-effects de entorno antes de loadEvolabConfig / corrida larga. */
export function applyRunProfile(profile: RunProfile = resolveRunProfile()): RunProfile {
  switch (profile) {
    case 'api-only':
      process.env.EPIS2_EVOLAB_BROWSER = '0';
      break;
    case 'visual-smoke':
      process.env.EPIS2_EVOLAB_BROWSER = '1';
      break;
    case 'hybrid':
      break;
    default:
      break;
  }
  process.env[PROFILE_ENV] = profile;
  return profile;
}

export function describeRunProfile(profile: RunProfile): string {
  switch (profile) {
    case 'api-only':
      return 'API-first · sin Playwright · recomendado evolve/F5';
    case 'hybrid':
      return 'Browser según EPIS2_EVOLAB_BROWSER · mutación + sandbox mixto';
    case 'visual-smoke':
      return 'Browser on · smoke visual corto (≤15 min)';
    default:
      return profile;
  }
}
