import { parse as parseYaml } from 'yaml';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ScenarioDefinitionSchema, type ScenarioDefinition } from '../contracts/schemas.js';
import {
  loadScenario,
  loadScenarioFromFile,
  scenariosDirectory,
  candidatesDirectory,
} from './loader.js';
import { getArchiveEntryByCandidateId } from '../evolution/archive-repository.js';

export type ScenarioSource = 'corpus' | 'candidate' | 'archive';

export type ResolvedScenario = {
  scenario: ScenarioDefinition;
  source: ScenarioSource;
};

function scenarioFileSource(scenarioId: string): ScenarioSource | null {
  const corpusYaml = join(scenariosDirectory(), `${scenarioId}.yaml`);
  const corpusYml = join(scenariosDirectory(), `${scenarioId}.yml`);
  if (existsSync(corpusYaml) || existsSync(corpusYml)) return 'corpus';
  const candYaml = join(candidatesDirectory(), `${scenarioId}.yaml`);
  const candYml = join(candidatesDirectory(), `${scenarioId}.yml`);
  if (existsSync(candYaml) || existsSync(candYml)) return 'candidate';
  return null;
}

/**
 * Resuelve escenario para replay: corpus → candidates/ → evolution_archive (S16.2).
 */
export async function resolveScenarioDefinition(
  scenarioId: string,
  databaseUrl?: string,
): Promise<ResolvedScenario> {
  const fileSource = scenarioFileSource(scenarioId);
  if (fileSource) {
    return { scenario: loadScenario(scenarioId), source: fileSource };
  }

  if (databaseUrl) {
    const entry = await getArchiveEntryByCandidateId(databaseUrl, scenarioId);
    if (entry) {
      const parsed = parseYaml(entry.scenarioYaml) as unknown;
      const scenario = ScenarioDefinitionSchema.parse(parsed);
      return { scenario, source: 'archive' };
    }
  }

  throw new Error(
    `Escenario no encontrado: ${scenarioId} (corpus, candidates/ ni evolution_archive)`,
  );
}

export function loadScenarioFromYamlString(yaml: string): ScenarioDefinition {
  const parsed = parseYaml(yaml) as unknown;
  return ScenarioDefinitionSchema.parse(parsed);
}

export { loadScenarioFromFile };
