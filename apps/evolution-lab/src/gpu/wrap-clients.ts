import type { EmbeddingsClient } from '../fitness/novelty.js';
import type { ScenarioMutationClient } from '../mutation/ollama-mutator.js';
import { withExclusiveModel } from './orchestrator.js';

export function wrapMutationClientWithGpuOrchestrator(
  baseUrl: string,
  client: ScenarioMutationClient,
): ScenarioMutationClient {
  return {
    async generate(req) {
      return withExclusiveModel(baseUrl, req.model, () => client.generate(req));
    },
  };
}

export function wrapEmbeddingsClientWithGpuOrchestrator(
  baseUrl: string,
  client: EmbeddingsClient,
): EmbeddingsClient {
  return {
    model: client.model,
    async embed(texts) {
      return withExclusiveModel(baseUrl, client.model, () => client.embed(texts));
    },
  };
}
