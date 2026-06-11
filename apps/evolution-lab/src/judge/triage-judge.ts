import { tryDeterministicDuplicate } from './deterministic-dedup.js';
import type { JudgeTriageClient } from './ollama-judge-client.js';
import {
  DEFAULT_JUDGE_MODEL,
  JUDGE_PROMPT_VERSION,
  type JudgeTriageInput,
  type JudgeTriageOutput,
} from './schemas.js';

export type ClassifyFindingResult = {
  output: JudgeTriageOutput;
  model: string;
  promptVersion: string;
  source: 'deterministic' | 'llm';
};

/**
 * Clasifica un finding advisory. Nunca modifica review_status.
 */
export async function classifyFinding(
  input: JudgeTriageInput,
  client: JudgeTriageClient,
  opts: { model?: string } = {},
): Promise<ClassifyFindingResult> {
  const deterministic = tryDeterministicDuplicate(input);
  if (deterministic) {
    return {
      output: deterministic,
      model: 'deterministic',
      promptVersion: JUDGE_PROMPT_VERSION,
      source: 'deterministic',
    };
  }

  const model = opts.model ?? DEFAULT_JUDGE_MODEL;
  const result = await client.classify({ model, input });
  if (!result.ok) {
    throw new Error(result.error);
  }

  return {
    output: result.output,
    model: result.model,
    promptVersion: JUDGE_PROMPT_VERSION,
    source: 'llm',
  };
}
