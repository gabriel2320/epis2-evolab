import { ScenarioDefinitionSchema, type ScenarioDefinition } from '../contracts/schemas.js';
import {
  ENDPOINT_CATALOG,
  endpointKey,
  normalizeApiPath,
  resolveEndpointKey,
  type HttpMethod,
} from '../fitness/coverage-catalog.js';
import { listCustomSteps } from '../step-engine/custom-steps.js';
import {
  isApiStep,
  isBrowserStep,
  isCustomStep,
  type DeclarativeStep,
} from '../step-engine/schema.js';
import {
  baseContextKeys,
  observationLabels,
  stepContextAdditions,
  stepLabel,
  stepPlaceholderUses,
} from './flow-context.js';
import { roleCanApproveDrafts, ROLE_CATALOG, type MutationTask } from './operators.js';

export type ValidationLayer = 'zod' | 'semantic' | 'dryrun';

export type ValidationIssue = {
  layer: ValidationLayer;
  message: string;
  /** Solo errores de capas 2-3 son reparables (spec §2.7); allowlist nunca. */
  repairable: boolean;
};

export type ValidationResult =
  | { valid: true; scenario: ScenarioDefinition; issues: [] }
  | { valid: false; scenario?: ScenarioDefinition; issues: ValidationIssue[] };

export type ValidationContext = {
  corpusIds: ReadonlySet<string>;
  task?: MutationTask;
};

const CATALOG_KEYS = new Set(ENDPOINT_CATALOG.map((e) => endpointKey(e.method, e.path)));

/** Gate de seguridad Evolab: solo paths del catálogo de cobertura (Sprint 7). */
export function isPathAllowed(method: HttpMethod, path: string): boolean {
  return CATALOG_KEYS.has(resolveEndpointKey(method, path));
}

function semanticIssue(message: string, repairable = true): ValidationIssue {
  return { layer: 'semantic', message, repairable };
}

function checkPlaceholderResolution(scenario: ScenarioDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const available = baseContextKeys(scenario);
  for (const [index, step] of (scenario.flow ?? []).entries()) {
    const label = stepLabel(step, index);
    for (const use of stepPlaceholderUses(step)) {
      if (!available.has(use.key)) {
        issues.push(
          semanticIssue(
            `flow[${index}] (${label}) placeholder {${use.key}} en ${use.field} no definido antes de su uso (contexto base + captures previos)`,
          ),
        );
      }
    }
    for (const key of stepContextAdditions(step)) {
      available.add(key);
    }
  }
  return issues;
}

function checkOperatorInvariants(
  scenario: ScenarioDefinition,
  task: MutationTask,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const parentFlowLength = (task.parent.flow ?? []).length;
  const flowLength = (scenario.flow ?? []).length;

  if (task.operator === 'role_swap') {
    const targetRole = task.params.targetRole;
    if (targetRole && scenario.persona.role !== targetRole) {
      issues.push(
        semanticIssue(
          `role_swap: persona.role es "${scenario.persona.role}" pero el rol destino es "${targetRole}"`,
        ),
      );
    }
    if (flowLength !== parentFlowLength) {
      issues.push(
        semanticIssue(
          `role_swap: el flow debe conservar ${parentFlowLength} pasos (tiene ${flowLength})`,
        ),
      );
    }
  } else if (task.operator === 'payload_perturbation') {
    if (scenario.expected.actionBlocked !== true) {
      issues.push(
        semanticIssue(
          'payload_perturbation: expected.actionBlocked debe ser true (la API rechaza)',
        ),
      );
    }
    const bodies = (flow: DeclarativeStep[] | undefined): string =>
      JSON.stringify((flow ?? []).filter(isApiStep).map((s) => s.api.body ?? null));
    if (flowLength === parentFlowLength && bodies(scenario.flow) === bodies(task.parent.flow)) {
      issues.push(
        semanticIssue('payload_perturbation: ningún body api difiere del escenario padre'),
      );
    }
  } else if (task.operator === 'step_injection') {
    if (flowLength !== parentFlowLength + 1) {
      issues.push(
        semanticIssue(
          `step_injection: el flow debe tener exactamente ${parentFlowLength + 1} pasos (tiene ${flowLength})`,
        ),
      );
    }
  }
  return issues;
}

function checkSemantics(scenario: ScenarioDefinition, ctx: ValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const flow = scenario.flow ?? [];

  if (flow.length === 0) {
    issues.push(semanticIssue('El escenario mutado no tiene flow ejecutable'));
    return issues;
  }

  // Allowlist de seguridad: descarte inmediato sin reparación (spec §2.6).
  for (const [index, step] of flow.entries()) {
    if (isApiStep(step) && !isPathAllowed(step.api.method, step.api.path)) {
      issues.push({
        layer: 'semantic',
        message: `flow[${index}] path fuera del allowlist sandbox: ${step.api.method} ${normalizeApiPath(step.api.path)}`,
        repairable: false,
      });
    }
    if (isCustomStep(step) && !listCustomSteps().includes(step.custom.name)) {
      issues.push(semanticIssue(`flow[${index}] custom step desconocido: ${step.custom.name}`));
    }
  }

  // Labels api únicos.
  const apiLabels = flow.filter(isApiStep).map((s) => s.api.label);
  const duplicates = apiLabels.filter((label, i) => apiLabels.indexOf(label) !== i);
  for (const dup of new Set(duplicates)) {
    issues.push(semanticIssue(`Label api duplicado en flow: "${dup}"`));
  }

  // Resolución de placeholders (modo de fallo dominante del benchmark, R1).
  issues.push(...checkPlaceholderResolution(scenario));

  // actionObservation apunta a un label existente.
  if (scenario.actionObservation && !observationLabels(scenario).has(scenario.actionObservation)) {
    issues.push(
      semanticIssue(
        `actionObservation "${scenario.actionObservation}" no corresponde a ningún label del flow`,
      ),
    );
  }

  // Identidad y rol.
  if (ctx.corpusIds.has(scenario.id)) {
    issues.push(semanticIssue(`id "${scenario.id}" colisiona con un escenario del corpus`));
  }
  if (ctx.task && scenario.id === ctx.task.parent.id) {
    issues.push(semanticIssue(`id "${scenario.id}" es idéntico al del escenario padre`));
  }
  if (!(ROLE_CATALOG as readonly string[]).includes(scenario.persona.role)) {
    issues.push(
      semanticIssue(
        `Rol inválido "${scenario.persona.role}" (válidos: ${ROLE_CATALOG.join(', ')})`,
      ),
    );
  }

  // Coherencia RBAC: un rol sin permiso de approve no puede esperar éxito (R5).
  const action = scenario.goal.action.toLowerCase();
  if (
    action.includes('approve') &&
    !roleCanApproveDrafts(scenario.persona.role) &&
    scenario.expected.actionBlocked === false
  ) {
    issues.push(
      semanticIssue(
        `expected.actionBlocked=false incoherente: el rol "${scenario.persona.role}" no puede aprobar según la matriz RBAC`,
      ),
    );
  }

  if (ctx.task) {
    issues.push(...checkOperatorInvariants(scenario, ctx.task));
  }
  return issues;
}

/**
 * Capa 3 — dry-run sin HTTP: recorre el flow resolviendo placeholders
 * simbólicamente (contexto sintético en memoria) y simulando captures, igual
 * que el step-engine pero sin llamadas. Detecta captures imposibles y rutas
 * malformadas antes de gastar un run de sandbox.
 */
export function dryRunFlow(scenario: ScenarioDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ctx: Record<string, string> = {};
  for (const key of baseContextKeys(scenario)) {
    ctx[key] = `sym-${key}`;
  }

  const resolveSymbolic = (template: string, where: string, index: number): void => {
    const resolved = template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, key: string) => {
      const value = ctx[key];
      if (value === undefined) {
        issues.push({
          layer: 'dryrun',
          message: `flow[${index}] dry-run: placeholder sin resolver {${key}} en ${where}`,
          repairable: true,
        });
        return `{${key}}`;
      }
      return value;
    });
    if (where === 'api.path' && !resolved.startsWith('/')) {
      issues.push({
        layer: 'dryrun',
        message: `flow[${index}] dry-run: path malformado "${resolved}" (debe iniciar con /)`,
        repairable: true,
      });
    }
  };

  const resolveBody = (body: Record<string, unknown>, index: number): void => {
    for (const value of Object.values(body)) {
      if (typeof value === 'string') {
        resolveSymbolic(value, 'api.body', index);
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        resolveBody(value as Record<string, unknown>, index);
      }
    }
  };

  for (const [index, step] of (scenario.flow ?? []).entries()) {
    if (isApiStep(step)) {
      resolveSymbolic(step.api.path, 'api.path', index);
      if (step.api.body) resolveBody(step.api.body, index);
      if (step.api.failOnMissingCapture) {
        resolveSymbolic(
          step.api.failOnMissingCapture.replace('{status}', '000'),
          'api.failOnMissingCapture',
          index,
        );
      }
    } else if (isBrowserStep(step)) {
      if (step.browser.open) resolveSymbolic(step.browser.open, 'browser.open', index);
      for (const value of Object.values(step.browser.payload ?? {})) {
        resolveSymbolic(value, 'browser.payload', index);
      }
    }
    for (const key of stepContextAdditions(step)) {
      ctx[key] = `sym-${key}`;
    }
  }
  return issues;
}

const PLACEHOLDER_ISSUE_RE = /flow\[(\d+)\].*\{([a-zA-Z0-9_]+)\}/;

/**
 * Dedup de issues: el mismo placeholder colgante aparece en capa 2 (semántica)
 * y capa 3 (dry-run); contarlo dos veces infla el conteo del límite de
 * reparación (≤4 errores, spec §2.7). Se colapsa por (paso, placeholder).
 */
function dedupeIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const placeholder = PLACEHOLDER_ISSUE_RE.exec(issue.message);
    const key = placeholder
      ? `placeholder:${placeholder[1]}:${placeholder[2]}`
      : `${issue.layer}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Validación en 3 capas (spec §2.6): Zod real → semántica del motor →
 * dry-run simbólico. Devuelve todos los errores acumulados para que el
 * reparador reciba la lista literal completa.
 */
export function validateCandidate(raw: unknown, ctx: ValidationContext): ValidationResult {
  const parsed = ScenarioDefinitionSchema.safeParse(raw);
  if (!parsed.success) {
    const issues: ValidationIssue[] = parsed.error.issues.slice(0, 8).map((zi) => ({
      layer: 'zod' as const,
      message: `Zod ${zi.path.join('.') || '(raíz)'}: ${zi.message}`,
      repairable: false,
    }));
    return { valid: false, issues };
  }

  const scenario = parsed.data;
  const issues = dedupeIssues([...checkSemantics(scenario, ctx), ...dryRunFlow(scenario)]);
  if (issues.length === 0) {
    return { valid: true, scenario, issues: [] };
  }
  return { valid: false, scenario, issues };
}

/** Política de reparación (spec §2.7): solo capas 2-3, reparables y ≤4 errores. */
export function isRepairable(result: ValidationResult): boolean {
  if (result.valid) return false;
  return (
    result.issues.length > 0 &&
    result.issues.length <= 4 &&
    result.issues.every((i) => i.repairable && i.layer !== 'zod')
  );
}
