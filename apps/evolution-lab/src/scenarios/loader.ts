import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { ScenarioDefinitionSchema, type ScenarioDefinition } from '../contracts/schemas.js';

export function scenariosDirectory(): string {
  return resolve(fileURLToPath(new URL('../../scenarios', import.meta.url)));
}

export function loadScenario(scenarioId: string): ScenarioDefinition {
  for (const dir of [scenariosDirectory(), candidatesDirectory()]) {
    const yamlPath = join(dir, `${scenarioId}.yaml`);
    const ymlPath = join(dir, `${scenarioId}.yml`);
    const path = existsSync(yamlPath) ? yamlPath : existsSync(ymlPath) ? ymlPath : undefined;
    if (path) {
      return loadScenarioFromFile(path);
    }
  }
  throw new Error(`Escenario no encontrado: ${scenarioId}`);
}

export function listScenarios(): ScenarioDefinition[] {
  const dir = scenariosDirectory();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map((f) => loadScenario(f.replace(/\.(yaml|yml)$/, '')));
}

/** Directorio de candidatos mutados (gitignored; no es corpus canónico). */
export function candidatesDirectory(): string {
  return join(scenariosDirectory(), 'candidates');
}

export function loadScenarioFromFile(filePath: string): ScenarioDefinition {
  const raw = readFileSync(filePath, 'utf8');
  const parsed = parseYaml(raw) as unknown;
  return ScenarioDefinitionSchema.parse(parsed);
}

/** Candidatos YAML aceptados por el pipeline de mutación (S8/S9). */
export function listCandidateFiles(): string[] {
  const dir = candidatesDirectory();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map((f) => join(dir, f));
}
