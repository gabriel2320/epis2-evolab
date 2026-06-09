import type { EvolabConfig } from '../config/env.js';
import type { ScenarioDefinition } from '../contracts/schemas.js';
import { OllamaInferenceQueue } from '../ollama/inference-queue.js';
import { OllamaModelRegistry } from '../ollama/model-registry.js';
import { OllamaStructuredOutputClient } from '../ollama/structured-client.js';
import { OllamaTaskRouter } from '../ollama/task-router.js';
import { buildSimulatedUserPrompt } from './prompts.js';
import {
  FALLBACK_SIMULATED_USER_PLAN,
  SimulatedUserPlanSchema,
  type SimulatedUserPlan,
  type SimulatedUserStep,
} from './schemas.js';

export type SimulatedUserPlanResult = {
  plan: SimulatedUserPlan;
  model: string;
  source: 'ollama' | 'fallback';
  raw?: string;
  error?: string;
  repaired?: boolean;
};

export class SimulatedUserAgent {
  private readonly registry: OllamaModelRegistry;
  private readonly router: OllamaTaskRouter;
  private readonly queue: OllamaInferenceQueue;
  private readonly client: OllamaStructuredOutputClient;

  constructor(private readonly config: EvolabConfig) {
    this.registry = new OllamaModelRegistry(config.ollamaUrl, config.model);
    this.router = new OllamaTaskRouter(config.model, config.fastModel);
    this.queue = new OllamaInferenceQueue(
      config.llmConcurrency,
      config.maxModelErrors,
      30_000,
      120_000,
    );
    this.client = new OllamaStructuredOutputClient(config.ollamaUrl, (fn, signal) =>
      this.queue.enqueue(fn, signal),
    );
  }

  async planScenario(scenario: ScenarioDefinition): Promise<SimulatedUserPlanResult> {
    const inventory = await this.registry.discover();
    if (!inventory.up || inventory.models.length === 0) {
      return {
        plan: fallbackPlanFromScenario(scenario),
        model: '',
        source: 'fallback',
        error: 'Ollama no disponible',
      };
    }

    const route = this.router.route('simulated_user', inventory.models.map((m) => m.name));
    if (!route.model) {
      return {
        plan: fallbackPlanFromScenario(scenario),
        model: '',
        source: 'fallback',
        error: route.reason,
      };
    }

    const prompt = buildSimulatedUserPrompt(scenario);
    const inference = await this.client.inferStructured(
      route.model,
      prompt,
      SimulatedUserPlanSchema,
      fallbackPlanFromScenario(scenario),
    );

    if (inference.ok) {
      return {
        plan: inference.data,
        model: route.model,
        source: 'ollama',
        raw: inference.raw,
        repaired: inference.repaired,
      };
    }

    return {
      plan: inference.fallback,
      model: route.model,
      source: 'fallback',
      raw: inference.raw,
      error: inference.error,
    };
  }
}

export function fallbackPlanFromScenario(scenario: ScenarioDefinition): SimulatedUserPlan {
  const steps = scenario.steps.slice(0, 12).map((step, index) => ({
    stepId: step.replace(/[^a-z0-9]+/gi, '_').slice(0, 40) || `step_${index + 1}`,
    channel: inferChannel(step),
    action: step,
    target: inferTarget(step, scenario),
  }));

  return {
    personaSummary: `${scenario.persona.role} (${scenario.persona.experience ?? 'default'}) en sandbox demo`,
    goalInterpretation: scenario.goal.action,
    steps: steps.length > 0 ? steps : FALLBACK_SIMULATED_USER_PLAN.steps,
    riskNotes: scenario.risk === 'high' ? 'Escenario de alto riesgo clínico' : undefined,
  };
}

function inferChannel(step: string): SimulatedUserStep['channel'] {
  if (/login|api|approve|draft|mar|ack|POST|GET/i.test(step)) return 'api';
  if (/command|evolucionar|evolution|nota|power|resolve_/i.test(step)) return 'command';
  if (/open_|pin_|navigate|click|ui|browser|form|ficha|patient/i.test(step)) return 'browser';
  return 'observe';
}

function inferTarget(step: string, scenario: ScenarioDefinition): string | undefined {
  if (step.includes('login')) return '/api/auth/login';
  if (step.includes('command') || step.includes('comando')) return '/comando';
  if (step.includes('draft') || step.includes('borrador')) {
    const draftId = (scenario.fixture as Record<string, unknown> | undefined)?.draftId;
    return draftId ? `/espacio/borrador/${String(draftId)}` : '/espacio/borrador';
  }
  if (step.includes('patient') || step.includes('ficha')) return '/espacio/ficha';
  if (step.includes('mar')) return '/espacio/mar';
  if (step.includes('discharge') || step.includes('epicrisis')) return '/espacio/epicrisis';
  return undefined;
}

export function createSimulatedUserAgent(config: EvolabConfig): SimulatedUserAgent {
  return new SimulatedUserAgent(config);
}
