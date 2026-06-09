import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { ScenarioDefinitionSchema, type ScenarioDefinition } from '../contracts/schemas.js';

export function scenariosDirectory(): string {
  return resolve(fileURLToPath(new URL('../../scenarios', import.meta.url)));
}

export function loadScenario(scenarioId: string): ScenarioDefinition {
  const dir = scenariosDirectory();
  const yamlPath = join(dir, `${scenarioId}.yaml`);
  const ymlPath = join(dir, `${scenarioId}.yml`);
  const path = existsSync(yamlPath) ? yamlPath : existsSync(ymlPath) ? ymlPath : undefined;
  if (!path) {
    throw new Error(`Escenario no encontrado: ${scenarioId}`);
  }
  const raw = readFileSync(path, 'utf8');
  const parsed = parseYaml(raw) as unknown;
  return ScenarioDefinitionSchema.parse(parsed);
}

export function listScenarios(): ScenarioDefinition[] {
  const dir = scenariosDirectory();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map((f) => loadScenario(f.replace(/\.(yaml|yml)$/, '')));
}
