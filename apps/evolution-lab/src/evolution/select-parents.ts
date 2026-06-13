import { parse as parseYaml } from 'yaml';
import type { ScenarioDefinition } from '../contracts/schemas.js';
import { ScenarioDefinitionSchema } from '../contracts/schemas.js';
import type { ArchiveEntry } from './archive.js';
import {
  adjacentNicheKeys,
  assignNiche,
  emptyNiches,
  nicheKey,
  parseNicheKey,
  type Niche,
} from './niches.js';

export type ParentSelectionOptions = {
  corpus: ScenarioDefinition[];
  elites: ArchiveEntry[];
  /** Semilla determinista para reproducibilidad (p.ej. generación). */
  seed: number;
  /** Cuántos padres devolver (default 1). */
  count?: number;
  /** S14.2 — restringe selección a nichos vacíos/frontera en este subconjunto */
  focusNicheKeys?: Set<string>;
};

/** xorshift32 — PRNG ligero y determinista para selección sesgada. */
export function xorshift32(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
}

function parseEliteScenario(entry: ArchiveEntry): ScenarioDefinition | undefined {
  try {
    return ScenarioDefinitionSchema.parse(parseYaml(entry.scenarioYaml));
  } catch {
    return undefined;
  }
}

/** Peso de un padre según nicho vacío o frontera (S9.3). */
export function parentWeight(
  scenario: ScenarioDefinition,
  emptyKeys: Set<string>,
  frontierKeys: Set<string>,
): number {
  const key = nicheKey(assignNiche(scenario));
  if (emptyKeys.has(key)) return 4;
  if (frontierKeys.has(key)) return 2;
  return 1;
}

/** Nichos frontera: ocupados cuyo vecino directo está vacío. */
export function computeFrontierKeys(
  occupiedKeys: Set<string>,
  emptyKeys: Set<string>,
): Set<string> {
  const frontier = new Set<string>();
  for (const key of occupiedKeys) {
    const parsed = parseNicheKey(key);
    if (!parsed) continue;
    for (const adj of adjacentNicheKeys(parsed)) {
      if (emptyKeys.has(adj)) {
        frontier.add(key);
        break;
      }
    }
  }
  return frontier;
}

/**
 * Selección sesgada de padres (S9.3): corpus humano + élites del archivo;
 * prioriza nichos vacíos y frontera para evitar colapso a un solo nicho.
 */
export function selectParents(options: ParentSelectionOptions): ScenarioDefinition[] {
  const count = options.count ?? 1;
  const occupiedKeys = new Set<string>();
  for (const s of options.corpus) {
    occupiedKeys.add(nicheKey(assignNiche(s)));
  }
  for (const e of options.elites) {
    occupiedKeys.add(e.nicheKey);
  }

  let empty = emptyNiches(options.corpus, occupiedKeys);
  if (options.focusNicheKeys && options.focusNicheKeys.size > 0) {
    empty = empty.filter((n) => options.focusNicheKeys!.has(nicheKey(n)));
  }
  const emptyKeys = new Set(empty.map(nicheKey));
  let frontierKeys = computeFrontierKeys(occupiedKeys, emptyKeys);
  if (options.focusNicheKeys && options.focusNicheKeys.size > 0) {
    frontierKeys = new Set(
      [...frontierKeys].filter((key) => options.focusNicheKeys!.has(key)),
    );
  }

  const pool: ScenarioDefinition[] = [...options.corpus];
  for (const elite of options.elites) {
    const parsed = parseEliteScenario(elite);
    if (parsed) pool.push(parsed);
  }

  if (pool.length === 0) return [];

  const rng = xorshift32(options.seed);
  const selected: ScenarioDefinition[] = [];
  const usedIds = new Set<string>();

  for (let i = 0; i < count; i += 1) {
    const weights = pool.map((s) =>
      usedIds.has(s.id) ? 0 : parentWeight(s, emptyKeys, frontierKeys),
    );
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) break;

    let pick = rng() * total;
    let chosen = pool[0]!;
    for (let j = 0; j < pool.length; j += 1) {
      pick -= weights[j]!;
      if (pick <= 0) {
        chosen = pool[j]!;
        break;
      }
    }
    selected.push(chosen);
    usedIds.add(chosen.id);
  }

  return selected;
}

/** Nicho objetivo de la generación: uno vacío al azar (determinista). */
export function pickFocusEmptyNiche(
  corpus: ScenarioDefinition[],
  occupiedKeys: Set<string>,
  seed: number,
): Niche | undefined {
  const empty = emptyNiches(corpus, occupiedKeys);
  if (empty.length === 0) return undefined;
  const rng = xorshift32(seed);
  return empty[Math.floor(rng() * empty.length)]!;
}
