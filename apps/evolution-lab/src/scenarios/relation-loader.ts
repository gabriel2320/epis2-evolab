import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import {
  MetamorphicRelationSchema,
  type MetamorphicRelation,
} from '../contracts/metamorphic-schema.js';
import type { ScenarioDefinition } from '../contracts/schemas.js';
import { loadScenario } from './loader.js';
import { isApiStep } from '../step-engine/schema.js';

export function relationsDirectory(): string {
  return resolve(fileURLToPath(new URL('../../scenarios/relations', import.meta.url)));
}

export function loadRelation(relationId: string): MetamorphicRelation {
  const dir = relationsDirectory();
  const yamlPath = join(dir, `${relationId}.yaml`);
  const ymlPath = join(dir, `${relationId}.yml`);
  const path = existsSync(yamlPath) ? yamlPath : existsSync(ymlPath) ? ymlPath : undefined;
  if (!path) {
    throw new Error(`Relación metamórfica no encontrada: ${relationId}`);
  }
  const raw = readFileSync(path, 'utf8');
  const parsed = parseYaml(raw) as unknown;
  return MetamorphicRelationSchema.parse(parsed);
}

export function listRelations(): MetamorphicRelation[] {
  const dir = relationsDirectory();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map((f) => loadRelation(f.replace(/\.(yaml|yml)$/, '')));
}

export function applyScenarioOverrides(
  base: ScenarioDefinition,
  overrides?:
    | {
        persona?: { role?: string | undefined } | undefined;
        expected?: Record<string, unknown> | undefined;
        fixture?: Record<string, unknown> | undefined;
      }
    | undefined,
): ScenarioDefinition {
  if (!overrides) return base;
  return {
    ...base,
    persona: overrides.persona?.role
      ? { ...base.persona, role: overrides.persona.role }
      : base.persona,
    expected: overrides.expected ? { ...base.expected, ...overrides.expected } : base.expected,
    fixture: overrides.fixture ? { ...(base.fixture ?? {}), ...overrides.fixture } : base.fixture,
  };
}

/** Dry-run estático: referencias y labels de verify existen en los flows referenciados. */
export function validateRelationDryRun(relation: MetamorphicRelation): string[] {
  const issues: string[] = [];

  const resolveScenario = (scenarioId: string): ScenarioDefinition => {
    try {
      return loadScenario(scenarioId);
    } catch {
      issues.push(`Escenario referenciado no existe: ${scenarioId}`);
      throw new Error('abort');
    }
  };

  let sourceScenario: ScenarioDefinition;
  try {
    sourceScenario = resolveScenario(relation.source.scenario);
  } catch {
    return issues;
  }

  const collectLabels = (scenario: ScenarioDefinition): Set<string> => {
    const labels = new Set<string>();
    if (scenario.actionObservation) labels.add(scenario.actionObservation);
    for (const step of scenario.flow ?? []) {
      if (isApiStep(step) && step.api.label) labels.add(step.api.label);
      if ('custom' in step && step.custom?.args?.label) {
        labels.add(String(step.custom.args.label));
      }
      if ('login' in step && step.login?.label) labels.add(step.login.label);
    }
    return labels;
  };

  const captureKeys = new Set<string>();
  for (const step of sourceScenario.flow ?? []) {
    if (isApiStep(step) && step.api.capture) {
      for (const key of Object.keys(step.api.capture)) captureKeys.add(key);
    }
  }

  if (relation.followUp?.reuseContext) {
    if (sourceScenario.actionObservation === 'mar_approve_attempt') {
      captureKeys.add('draftId');
    }
    for (const key of relation.followUp.reuseContext) {
      if (!captureKeys.has(key)) {
        issues.push(`reuseContext "${key}" no es capture del escenario source`);
      }
    }
  }

  const checkLabels = (scenario: ScenarioDefinition, prefix: string) => {
    const labels = collectLabels(scenario);
    for (const clause of relation.verify) {
      const refs = [
        clause.left,
        clause.right,
        clause.premise,
        clause.conclusion,
        clause.observation ? { run: 'source' as const, observation: clause.observation } : null,
      ].filter(Boolean) as Array<{ observation: string }>;
      for (const ref of refs) {
        if (!labels.has(ref.observation)) {
          issues.push(`${prefix}: label "${ref.observation}" no existe en flow de ${scenario.id}`);
        }
        if (ref.observation.includes('At') || clause.field?.includes('At')) {
          issues.push(`Campo temporal prohibido en comparación: ${ref.observation}`);
        }
      }
    }
  };

  checkLabels(sourceScenario, 'source');

  if (relation.followUp) {
    try {
      const followScenario = resolveScenario(relation.followUp.scenario);
      checkLabels(followScenario, 'followUp');
    } catch {
      return issues;
    }
  } else {
    checkLabels(sourceScenario, 'selfPair');
  }

  return issues;
}
