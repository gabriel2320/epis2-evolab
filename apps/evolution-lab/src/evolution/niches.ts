import type { ScenarioDefinition } from '../contracts/schemas.js';
import type { MetamorphicRelation } from '../contracts/metamorphic-schema.js';
import { loadScenario } from '../scenarios/loader.js';
import {
  CUSTOM_STEP_COVERAGE,
  ENDPOINT_CATALOG,
  resolveEndpointKey,
  type CatalogEndpoint,
  type HttpMethod,
} from '../fitness/coverage-catalog.js';
import { ROLE_CATALOG } from '../mutation/operators.js';
import { isApiStep, isBrowserStep, isCustomStep } from '../step-engine/schema.js';

/**
 * Espacio MAP-Elites (S9.1): nichos por (rol actor × módulo clínico × tipo de
 * resultado esperado). Las dimensiones derivan de datos existentes — roles de
 * la matriz RBAC (Sprint 8), módulos del catálogo de cobertura (Sprint 7) y el
 * tipo de resultado del `expected` del escenario.
 */

export const NICHE_ROLES = ROLE_CATALOG;
export type NicheRole = (typeof NICHE_ROLES)[number];

export const NICHE_MODULES = [
  'auth',
  'clinical',
  'inpatient',
  'dashboard',
  'audit',
  /** Ficha dual chartMode=paper (PROG-PAPER-MODE). */
  'paper',
  /** Ficha dual chartMode=traditional / legacy mode=classic (MF-DUAL-CHART). */
  'classic',
] as const;
export type NicheModule = (typeof NICHE_MODULES)[number];

export const NICHE_OUTCOMES = ['allowed', 'blocked', 'journey', 'metamorphic'] as const;
export type NicheOutcome = (typeof NICHE_OUTCOMES)[number];

export type Niche = {
  role: NicheRole;
  module: NicheModule;
  outcome: NicheOutcome;
};

/** Clave estable del nicho: `rol|módulo|resultado`. */
export function nicheKey(niche: Niche): string {
  return `${niche.role}|${niche.module}|${niche.outcome}`;
}

export function parseNicheKey(key: string): Niche | undefined {
  const [role, module, outcome] = key.split('|');
  if (
    (NICHE_ROLES as readonly string[]).includes(role ?? '') &&
    (NICHE_MODULES as readonly string[]).includes(module ?? '') &&
    (NICHE_OUTCOMES as readonly string[]).includes(outcome ?? '')
  ) {
    return { role, module, outcome } as Niche;
  }
  return undefined;
}

const ENDPOINT_MODULE_BY_KEY = new Map<string, CatalogEndpoint['module']>(
  ENDPOINT_CATALOG.map((e) => [resolveEndpointKey(e.method, e.path), e.module]),
);

function endpointModule(method: HttpMethod, path: string): NicheModule | undefined {
  return ENDPOINT_MODULE_BY_KEY.get(resolveEndpointKey(method, path));
}

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

type StepModuleInfo = {
  /** label de observación con el que se identifica el paso. */
  labels: string[];
  module: NicheModule | undefined;
  mutating: boolean;
};

function moduleFromVisualRoute(route: string): NicheModule | undefined {
  if (route.includes('chartMode=paper')) return 'paper';
  if (route.includes('chartMode=traditional') || route.includes('mode=classic')) return 'classic';
  return undefined;
}

function stepModules(scenario: ScenarioDefinition): StepModuleInfo[] {
  const infos: StepModuleInfo[] = [];
  for (const step of scenario.flow ?? []) {
    if (isBrowserStep(step)) {
      const open = step.browser.open ?? '';
      const visualModule = moduleFromVisualRoute(open);
      infos.push({
        labels: [step.browser.label ?? 'browser'],
        module: visualModule,
        mutating: false,
      });
    } else if (isApiStep(step)) {
      infos.push({
        labels: [step.api.observe?.label ?? step.api.label, step.api.label],
        module: endpointModule(step.api.method as HttpMethod, step.api.path),
        mutating: MUTATING_METHODS.has(step.api.method),
      });
    } else if (isCustomStep(step)) {
      const coverage = CUSTOM_STEP_COVERAGE[step.custom.name];
      const argLabel = step.custom.args?.label;
      const labels = [
        ...(typeof argLabel === 'string' ? [argLabel] : []),
        ...(coverage?.observationLabels ?? []),
      ];
      const first = coverage?.endpoints[0];
      infos.push({
        labels,
        module: first ? endpointModule(first.method, first.path) : undefined,
        mutating: (coverage?.endpoints ?? []).some((e) => MUTATING_METHODS.has(e.method)),
      });
    }
  }
  return infos;
}

/**
 * Módulo primario del escenario: el del paso señalado por `actionObservation`
 * (la acción que se evalúa); si no resuelve, el último paso api del flow; si
 * tampoco, el módulo no-auth más tocado. Determinista.
 */
export function scenarioPrimaryModule(scenario: ScenarioDefinition): NicheModule {
  if (scenario.tags?.includes('visual-paper')) return 'paper';
  if (
    scenario.tags?.includes('visual-classic') ||
    scenario.tags?.includes('visual-traditional')
  ) {
    return 'classic';
  }

  const infos = stepModules(scenario);

  if (scenario.actionObservation) {
    const match = infos.find((i) => i.labels.includes(scenario.actionObservation!));
    if (match?.module) return match.module;
  }

  for (let i = infos.length - 1; i >= 0; i -= 1) {
    const info = infos[i]!;
    if (info.module && info.module !== 'auth') return info.module;
  }

  const counts = new Map<NicheModule, number>();
  for (const info of infos) {
    if (info.module && info.module !== 'auth') {
      counts.set(info.module, (counts.get(info.module) ?? 0) + 1);
    }
  }
  let best: NicheModule = 'clinical';
  let bestCount = 0;
  for (const [module, count] of counts) {
    if (count > bestCount) {
      best = module;
      bestCount = count;
    }
  }
  return bestCount > 0 ? best : infos.some((i) => i.module === 'auth') ? 'auth' : 'clinical';
}

/**
 * Tipo de resultado esperado: `blocked` si la acción debe ser rechazada;
 * `journey` si encadena mutaciones en ≥2 módulos distintos (o está etiquetado
 * como journey); `allowed` en el resto.
 */
export function scenarioOutcome(scenario: ScenarioDefinition): NicheOutcome {
  if (scenario.expected.actionBlocked === true) return 'blocked';
  if (scenario.tags?.includes('journey')) return 'journey';
  const mutatingModules = new Set(
    stepModules(scenario)
      .filter((i) => i.mutating && i.module && i.module !== 'auth')
      .map((i) => i.module),
  );
  return mutatingModules.size >= 2 ? 'journey' : 'allowed';
}

/** Asigna el nicho MAP-Elites de un escenario (rol × módulo × resultado). */
export function assignNiche(scenario: ScenarioDefinition): Niche {
  const role = (
    (NICHE_ROLES as readonly string[]).includes(scenario.persona.role)
      ? scenario.persona.role
      : 'physician'
  ) as NicheRole;
  return {
    role,
    module: scenarioPrimaryModule(scenario),
    outcome: scenarioOutcome(scenario),
  };
}

/** Asigna nicho MAP-Elites para una relación metamórfica (outcome = metamorphic). */
export function assignNicheForRelation(relation: MetamorphicRelation): Niche {
  const base = assignNiche(loadScenario(relation.source.scenario));
  return { ...base, outcome: 'metamorphic' };
}

/** Enumera las 84 celdas del espacio (3 roles × 7 módulos × 4 resultados). */
export function enumerateNiches(): Niche[] {
  const niches: Niche[] = [];
  for (const role of NICHE_ROLES) {
    for (const module of NICHE_MODULES) {
      for (const outcome of NICHE_OUTCOMES) {
        niches.push({ role, module, outcome });
      }
    }
  }
  return niches;
}

/**
 * Celdas vacías del mapa: cruza el corpus (+ claves ocupadas del archivo,
 * p.ej. élites) contra el espacio completo.
 */
export function emptyNiches(
  corpus: ScenarioDefinition[],
  occupiedKeys: ReadonlySet<string> = new Set(),
): Niche[] {
  const occupied = new Set(occupiedKeys);
  for (const scenario of corpus) {
    occupied.add(nicheKey(assignNiche(scenario)));
  }
  return enumerateNiches().filter((n) => !occupied.has(nicheKey(n)));
}

/** Nichos adyacentes: difieren en exactamente una dimensión. */
export function adjacentNicheKeys(niche: Niche): Set<string> {
  const keys = new Set<string>();
  for (const role of NICHE_ROLES) {
    if (role !== niche.role) keys.add(nicheKey({ ...niche, role }));
  }
  for (const module of NICHE_MODULES) {
    if (module !== niche.module) keys.add(nicheKey({ ...niche, module }));
  }
  for (const outcome of NICHE_OUTCOMES) {
    if (outcome !== niche.outcome) keys.add(nicheKey({ ...niche, outcome }));
  }
  return keys;
}
