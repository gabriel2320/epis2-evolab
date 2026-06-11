import { z } from 'zod';

export const JudgeVerdictSchema = z.enum(['signal', 'noise', 'duplicate']);

export const JudgeTriageOutputSchema = z.object({
  verdict: JudgeVerdictSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(800),
  requiresHumanReview: z.literal(true),
  suggestedPriority: z.number().int().min(1).max(100).optional(),
  relatedFindingIds: z.array(z.string().uuid()).optional(),
});

export type JudgeTriageOutput = z.infer<typeof JudgeTriageOutputSchema>;

export const JudgeTriageInputSchema = z.object({
  finding: z.object({
    id: z.string(),
    runId: z.string(),
    scenarioId: z.string(),
    targetEnvironmentId: z.string(),
    category: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    confidence: z.number(),
    title: z.string(),
    expectedResult: z.string(),
    actualResult: z.string(),
    fingerprint: z.string(),
    recommendedAction: z.string(),
    affectedComponents: z.array(z.string()),
    reviewStatus: z.enum(['open', 'approved', 'rejected', 'duplicate']).optional(),
  }),
  scenario: z.object({
    id: z.string(),
    name: z.string(),
    risk: z.string(),
    personaRole: z.string(),
    goalAction: z.string(),
    evaluators: z.array(z.string()),
    tags: z.array(z.string()).optional(),
  }),
  evidence: z.object({
    runEvidenceDir: z.string().optional(),
    evaluations: z.array(
      z.object({
        evaluatorId: z.string(),
        passed: z.boolean(),
        severity: z.string().optional(),
        message: z.string(),
        details: z.record(z.unknown()).optional(),
      }),
    ),
    observationsSummary: z.string(),
    apiCaptures: z
      .array(
        z.object({
          label: z.string(),
          status: z.number().optional(),
          excerpt: z.string(),
        }),
      )
      .optional(),
  }),
  fingerprintHistory: z.array(
    z.object({
      findingId: z.string(),
      runId: z.string(),
      scenarioId: z.string(),
      severity: z.string(),
      reviewStatus: z.string(),
      createdAt: z.string(),
      humanDecision: z.string().optional(),
    }),
  ),
});

export type JudgeTriageInput = z.infer<typeof JudgeTriageInputSchema>;

export const JUDGE_PROMPT_VERSION = 'judge-triage-v1';
export const DEFAULT_JUDGE_MODEL = 'qwen3:8b';

export const JUDGE_FORMAT_SCHEMA = {
  type: 'object',
  required: ['verdict', 'confidence', 'rationale', 'requiresHumanReview'],
  properties: {
    verdict: { type: 'string', enum: ['signal', 'noise', 'duplicate'] },
    confidence: { type: 'number' },
    rationale: { type: 'string' },
    requiresHumanReview: { type: 'boolean', enum: [true] },
    suggestedPriority: { type: 'integer' },
    relatedFindingIds: { type: 'array', items: { type: 'string' } },
  },
} as const;
