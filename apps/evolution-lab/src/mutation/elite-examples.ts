import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import type { ScenarioDefinition } from '../contracts/schemas.js';
import { assignNiche, nicheKey, type Niche } from '../evolution/niches.js';
import { loadScenario, scenariosDirectory } from '../scenarios/loader.js';

type EliteManifest = {
  version: string;
  maxPerNiche: number;
  entries: Array<{ nicheKey: string; scenarioIds: string[] }>;
};

const MANIFEST_PATH = join(
  scenariosDirectory(),
  '..',
  'fixtures',
  'mutation-elite-examples.json',
);

let cachedManifest: EliteManifest | undefined;

function loadManifest(): EliteManifest {
  if (cachedManifest) return cachedManifest;
  const raw = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as EliteManifest;
  cachedManifest = raw;
  return raw;
}

/** Escenarios élite del archivo para un nicho (≤ maxPerNiche). */
export function eliteScenariosForNiche(niche: Niche): ScenarioDefinition[] {
  const manifest = loadManifest();
  const key = nicheKey(niche);
  const entry = manifest.entries.find((e) => e.nicheKey === key);
  if (!entry) return [];
  const limit = manifest.maxPerNiche ?? 2;
  return entry.scenarioIds
    .slice(0, limit)
    .map((id) => loadScenario(id));
}

/** Bloque few-shot para prompts de mutación (F4.5 — prepara F5). */
export function buildEliteFewShotBlock(parent: ScenarioDefinition): string {
  const elites = eliteScenariosForNiche(assignNiche(parent));
  if (elites.length === 0) return '';
  const blocks = elites.map(
    (s, i) =>
      `Ejemplo élite ${i + 1} (${nicheKey(assignNiche(s))}, id=${s.id}):\n${stringifyYaml(s).trim()}`,
  );
  return `EJEMPLOS ÉLITE (referencia de calidad YAML — no copies id, labels ni captures literales):\n\n${blocks.join('\n\n')}`;
}
