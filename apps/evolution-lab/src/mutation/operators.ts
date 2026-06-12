import type { ScenarioDefinition } from '../contracts/schemas.js';
import { ENDPOINT_CATALOG } from '../fitness/coverage-catalog.js';
import { listCustomSteps } from '../step-engine/custom-steps.js';

/** Versión de prompts registrada por variante (R6: deriva de prompts). */
export const PROMPT_VERSION = 's8-v3';

/** Ensemble validado empíricamente (benchmark Sprint 8 §1.4). */
export type MutationEnsemble = {
  /** Operadores locales rápidos: role_swap, step_injection (113 tok/s, 100%). */
  amplitude: string;
  /** Cadenas de captures rotas: payload_perturbation, crossover (100% en B). */
  depth: string;
  /** Único modelo que repara (3/3 en benchmark). */
  repair: string;
};

export const DEFAULT_ENSEMBLE: MutationEnsemble = {
  amplitude: 'qwen2.5-coder:7b',
  depth: 'qwen2.5-coder:14b',
  repair: 'qwen2.5-coder:14b',
};

export const GENERATION_TEMPERATURE = 0.7;
export const REPAIR_TEMPERATURE = 0.2;

export const ROLE_CATALOG = ['physician', 'nurse', 'admin'] as const;
export type EvolabRole = (typeof ROLE_CATALOG)[number];

/** Matriz RBAC mínima de EPIS2 sandbox usada en prompts y validación. */
export function roleCanApproveDrafts(role: string): boolean {
  return role === 'physician';
}

export const MUTATION_OPERATOR_NAMES = [
  'role_swap',
  'payload_perturbation',
  'step_injection',
  'crossover',
] as const;

export type MutationOperatorName = (typeof MUTATION_OPERATOR_NAMES)[number];

export type MutationTask = {
  operator: MutationOperatorName;
  parent: ScenarioDefinition;
  secondParent?: ScenarioDefinition;
  /** id prescrito para la variante — lo fija el motor, no el LLM. */
  variantId: string;
  /** Parámetros derivados determinísticamente por el pipeline. */
  params: Record<string, string>;
  index: number;
};

export type PromptPair = { system: string; user: string };

export type MutationOperator = {
  name: MutationOperatorName;
  description: string;
  model: string;
  temperature: number;
  buildPrompt(task: MutationTask): PromptPair;
};

function allowedPathsText(): string {
  return ENDPOINT_CATALOG.map(
    (e) => `  - ${e.method} ${e.path.replace(/:([a-zA-Z0-9]+)/g, '{$1}')}`,
  ).join('\n');
}

const RBAC_MATRIX_TEXT = `MATRIZ RBAC (para expected.actionBlocked):
- physician: crea y aprueba borradores clínicos; admite, traslada y da de alta pacientes.
- nurse: crea notas de enfermería y consulta dashboards; NO puede aprobar borradores (approve → bloqueado 403).
- admin: tareas administrativas y auditoría; NO crea ni aprueba borradores clínicos.
- expected.actionBlocked: true si y solo si la acción del goal debe ser rechazada por la API (por RBAC o por estado del recurso).`;

export function buildSystemPrompt(): string {
  return `Eres un operador de mutación de escenarios de prueba del laboratorio EPIS2 Evolab.
Recibes un escenario (JSON) y devuelves SOLO el escenario mutado COMPLETO como JSON, sin markdown ni comentarios.

REGLAS DE FORMATO (obligatorias):
- Conserva todas las claves del escenario: id, version, name, description, risk, target, persona, fixture, goal, steps, flow, expected, evaluators, actionObservation, timeoutMs, maxAttempts, tags.
- flow es una lista; cada paso es un objeto con EXACTAMENTE UNA clave: login | api | browser | wait | custom.
- Paso api: requiere label (snake_case único), method (GET|POST|PATCH|PUT|DELETE) y path; opcionales body, capture (claveContexto -> ruta.punteada de la respuesta), failOnMissingCapture y observe.
- Placeholders {x}: solo puedes usar {x} si x existe en el contexto base (claves de fixture, patientId, encounterId, today) o fue capturado con capture en un paso ANTERIOR del flow.
- REGLA CRÍTICA: si eliminas o invalidas un capture, ningún paso posterior puede seguir usando ese placeholder — elimina esos pasos dependientes y reapunta actionObservation.
- actionObservation debe ser el label de un paso api existente del flow.
- Paths permitidos (allowlist del sandbox EPIS2 — NO uses ningún otro):
${allowedPathsText()}
- Custom steps permitidos: ${listCustomSteps().join(', ')}.
- Roles válidos: ${ROLE_CATALOG.join(', ')}.

${RBAC_MATRIX_TEXT}`;
}

function scenarioJson(scenario: ScenarioDefinition): string {
  return JSON.stringify(scenario, null, 2);
}

function buildRoleSwapPrompt(task: MutationTask): PromptPair {
  const targetRole = task.params.targetRole ?? 'nurse';
  return {
    system: buildSystemPrompt(),
    user: `Escenario padre:
${scenarioJson(task.parent)}

TAREA (role_swap): cambia persona.role de "${task.parent.persona.role}" a "${targetRole}".
- Usa exactamente este id para la variante: "${task.variantId}".
- Ajusta name y description para reflejar el rol "${targetRole}".
- Ajusta el label del paso login (p.ej. login_${targetRole}).
- Ajusta expected.actionBlocked según la matriz RBAC para goal.action con el rol "${targetRole}".
- NO cambies la estructura del flow: mismos pasos, mismos paths, mismos captures.
Devuelve el escenario completo mutado como JSON.`,
  };
}

function buildPayloadPerturbationPrompt(task: MutationTask): PromptPair {
  const targetLabel = task.params.targetLabel ?? '';
  const perturbationKind = task.params.perturbationKind ?? 'campo_faltante';
  const targetField = task.params.targetField ?? '';
  const kindInstruction: Record<string, string> = {
    campo_faltante: `elimina el campo "${targetField}" del body`,
    valor_invalido: `reemplaza el valor del campo "${targetField}" por uno inválido para la API (tipo o formato incorrecto)`,
    id_inexistente: `reemplaza el valor del campo "${targetField}" por un id sintético que no existe (p.ej. 00000000-0000-4000-8000-000000000000)`,
  };
  return {
    system: buildSystemPrompt(),
    user: `Escenario padre:
${scenarioJson(task.parent)}

TAREA (payload_perturbation): perturba el body del paso api con label "${targetLabel}": ${kindInstruction[perturbationKind] ?? kindInstruction.campo_faltante}.
- Usa exactamente este id para la variante: "${task.variantId}".
- La API debe rechazar la petición perturbada: expected.actionBlocked debe ser true.
- REGLA CRÍTICA DE LIMPIEZA: si la perturbación impide que el capture del paso "${targetLabel}" se produzca (el recurso no se crea), ELIMINA los pasos posteriores que usen ese placeholder y reapunta actionObservation al paso "${targetLabel}".
- Ajusta name/description/goal.action para describir la perturbación.
Devuelve el escenario completo mutado como JSON.`,
  };
}

function buildStepInjectionPrompt(task: MutationTask): PromptPair {
  const afterLabel = task.params.afterLabel ?? '';
  const intent =
    task.params.intent ?? 'verificar el recurso recién creado/modificado consultándolo con GET';
  const placeholders = task.params.availablePlaceholders ?? '';
  return {
    system: buildSystemPrompt(),
    user: `Escenario padre:
${scenarioJson(task.parent)}

TAREA (step_injection): inserta exactamente UN paso api nuevo inmediatamente después del paso con label "${afterLabel}". Intención del paso nuevo: ${intent}.
- Usa exactamente este id para la variante: "${task.variantId}".
- En el paso nuevo usa SOLO placeholders de esta lista (calculada por el motor): [${placeholders}].
- El paso nuevo necesita un label snake_case nuevo que no colisione con los existentes.
- Añade la entrada legible correspondiente en steps.
- NO modifiques los demás pasos del flow ni expected ni actionObservation: el flow resultante tiene exactamente ${(task.parent.flow ?? []).length + 1} pasos.
Devuelve el escenario completo mutado como JSON.`,
  };
}

function buildCrossoverPrompt(task: MutationTask): PromptPair {
  const cutA = task.params.cutA ?? '';
  const cutB = task.params.cutB ?? '';
  const second = task.secondParent;
  return {
    system: buildSystemPrompt(),
    user: `Padre A:
${scenarioJson(task.parent)}

Padre B:
${second ? scenarioJson(second) : '(no disponible)'}

TAREA (crossover): combina el PREFIJO del flow de A (desde el inicio hasta el paso con label "${cutA}", inclusive) con el SUFIJO del flow de B (desde el paso con label "${cutB}", inclusive, hasta el final).
- Usa exactamente este id para la variante: "${task.variantId}".
- Renombra labels duplicados para que todos sean únicos.
- GARANTIZA que todo placeholder usado en el sufijo esté capturado en el prefijo o sea del contexto base (claves de fixture, patientId, encounterId, today); si un placeholder no se puede resolver, adapta o elimina ese paso.
- expected, evaluators y actionObservation provienen del padre B (su paso final queda como observación de la acción); si renombraste ese label, actualiza actionObservation.
- target.capabilities = unión de las capabilities de A y B; tags = unión de tags.
- fixture y persona provienen del padre A.
- Ajusta name, description y goal.action para describir el journey combinado.
Devuelve el escenario completo mutado como JSON.`,
  };
}

export function createOperators(ensemble: MutationEnsemble = DEFAULT_ENSEMBLE): MutationOperator[] {
  return [
    {
      name: 'role_swap',
      description: 'Cambia persona.role ajustando expected RBAC (amplitud)',
      model: ensemble.amplitude,
      temperature: GENERATION_TEMPERATURE,
      buildPrompt: buildRoleSwapPrompt,
    },
    {
      name: 'payload_perturbation',
      description: 'Perturba body de un paso api limpiando dependencias (profundidad)',
      model: ensemble.depth,
      temperature: GENERATION_TEMPERATURE,
      buildPrompt: buildPayloadPerturbationPrompt,
    },
    {
      name: 'step_injection',
      description: 'Inserta un paso api con placeholders ya capturados (amplitud)',
      model: ensemble.amplitude,
      temperature: GENERATION_TEMPERATURE,
      buildPrompt: buildStepInjectionPrompt,
    },
    {
      name: 'crossover',
      description: 'Combina prefijo de A con sufijo de B garantizando captures (profundidad)',
      model: ensemble.depth,
      temperature: GENERATION_TEMPERATURE,
      buildPrompt: buildCrossoverPrompt,
    },
  ];
}

/**
 * Prompt de reparación (spec §2.7): errores literales + cambio mínimo +
 * regla de eliminación de pasos dependientes (validada empíricamente 3/3).
 */
export function buildRepairPrompt(candidate: unknown, errors: string[]): PromptPair {
  return {
    system: buildSystemPrompt(),
    user: `El siguiente escenario mutado es INVÁLIDO:
${JSON.stringify(candidate, null, 2)}

Errores de validación detectados:
${errors.map((e) => `- ${e}`).join('\n')}

TAREA (reparación): corrige el escenario cambiando lo MÍNIMO necesario para resolver TODOS los errores listados.
- Si un placeholder queda colgante porque su capture ya no existe, ELIMINA los pasos posteriores que lo usan y reapunta actionObservation al último paso api válido.
- No cambies id, persona ni goal salvo que un error lo exija.
Devuelve el escenario completo corregido como JSON.`,
  };
}
