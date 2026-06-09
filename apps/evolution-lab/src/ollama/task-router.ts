export type LlmTask = 'simulated_user' | 'evaluator' | 'test_proposal' | 'patch_proposal';

export type RouteDecision = {
  task: LlmTask;
  model: string;
  reason: string;
};

export class OllamaTaskRouter {
  constructor(
    private readonly primaryModel: string,
    private readonly fastModel?: string,
  ) {}

  route(task: LlmTask, availableModels: string[]): RouteDecision {
    const hasPrimary = availableModels.includes(this.primaryModel);
    if (hasPrimary) {
      return {
        task,
        model: this.primaryModel,
        reason: `Modelo preferido ${this.primaryModel} disponible`,
      };
    }
    if (this.fastModel && availableModels.includes(this.fastModel)) {
      return {
        task,
        model: this.fastModel,
        reason: `Fallback fast model ${this.fastModel}`,
      };
    }
    const fallback = availableModels.find((m) => !m.includes('embed')) ?? '';
    return {
      task,
      model: fallback,
      reason: fallback ? 'Primer modelo generativo disponible' : 'Sin modelos',
    };
  }
}
