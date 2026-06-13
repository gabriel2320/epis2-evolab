import { describe, expect, it } from 'vitest';
import { JudgeTriageOutputSchema } from './schemas.js';
import { sanitizeJudgeParsed } from './ollama-judge-client.js';

describe('sanitizeJudgeParsed', () => {
  it('elimina suggestedPriority inválido (0) para validación Zod', () => {
    const raw = {
      verdict: 'signal',
      confidence: 0.7,
      rationale: 'Hallazgo clínico relevante',
      requiresHumanReview: true,
      suggestedPriority: 0,
    };
    const validated = JudgeTriageOutputSchema.parse(sanitizeJudgeParsed(raw));
    expect(validated.suggestedPriority).toBeUndefined();
  });

  it('filtra relatedFindingIds que no son UUID', () => {
    const raw = {
      verdict: 'noise',
      confidence: 0.5,
      rationale: 'Ruido',
      requiresHumanReview: true,
      relatedFindingIds: ['not-a-uuid', '00000000-0000-4000-8000-000000000001'],
    };
    const validated = JudgeTriageOutputSchema.parse(sanitizeJudgeParsed(raw));
    expect(validated.relatedFindingIds).toEqual(['00000000-0000-4000-8000-000000000001']);
  });
});
