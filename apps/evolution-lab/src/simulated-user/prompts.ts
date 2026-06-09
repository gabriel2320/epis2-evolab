import type { ScenarioDefinition } from '../contracts/schemas.js';

export function buildSimulatedUserPrompt(scenario: ScenarioDefinition): string {
  const steps = scenario.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const tags = scenario.tags?.join(', ') ?? 'none';
  const fixture = scenario.fixture ? JSON.stringify(scenario.fixture, null, 2) : '{}';
  const expected = JSON.stringify(scenario.expected, null, 2);

  return `Eres un agente de simulación clínica para EPIS2 Evolab (sandbox sintético DEMO).

Genera un plan JSON de acciones que un usuario humano realizaría para cumplir el objetivo del escenario.
NO inventes datos de pacientes reales. Solo fixtures demo (DEMO-00x).

Escenario: ${scenario.id} — ${scenario.name}
Riesgo: ${scenario.risk}
Descripción: ${scenario.description ?? 'N/A'}

Persona:
  rol: ${scenario.persona.role}
  experiencia: ${scenario.persona.experience ?? 'default'}

Objetivo declarado: ${scenario.goal.action}

Pasos YAML (referencia):
${steps}

Fixture:
${fixture}

Resultado esperado (evaluadores):
${expected}

Tags: ${tags}

Responde SOLO JSON con esta forma:
{
  "personaSummary": "string",
  "goalInterpretation": "string",
  "steps": [
    {
      "stepId": "snake_case_id",
      "channel": "browser|api|command|observe",
      "action": "verbo concreto",
      "target": "ruta o endpoint opcional",
      "naturalLanguage": "frase que escribiría en Centro de Comando (opcional)"
    }
  ],
  "riskNotes": "opcional"
}

Reglas:
- Máximo 12 pasos, mínimo 1.
- channel=command solo para instrucciones en lenguaje natural al Centro de Comando.
- channel=api para login demo, drafts, MAR, approve, etc.
- channel=browser para navegación UI Playwright.
- channel=observe para verificaciones pasivas.
- Si el escenario espera actionBlocked, incluir paso de intento y observación de denegación.`;
}
