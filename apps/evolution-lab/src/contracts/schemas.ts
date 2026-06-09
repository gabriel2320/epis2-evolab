import { z } from 'zod';

export const RunStatusSchema = z.enum([
  'pending',
  'preparing',
  'seeding',
  'starting_target',
  'running',
  'collecting_evidence',
  'evaluating',
  'passed',
  'reproducing',
  'unconfirmed',
  'finding_created',
  'test_candidate_created',
  'patch_candidate_created',
  'validating',
  'human_review',
  'approved',
  'rejected',
  'failed',
  'cancelled',
  'completed',
]);

export type RunStatus = z.infer<typeof RunStatusSchema>;

export const TargetEnvironmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  webBaseUrl: z.string().url(),
  apiBaseUrl: z.string().url(),
  databaseMode: z.enum(['none', 'read-only', 'sandbox-read-write']),
  environmentType: z.enum(['local-sandbox', 'ci-sandbox']),
  syntheticOnly: z.literal(true),
  allowFaultInjection: z.boolean(),
  allowDatabaseSeeding: z.boolean(),
});

export type TargetEnvironment = z.infer<typeof TargetEnvironmentSchema>;

export const EvolutionRunSchema = z.object({
  id: z.string().uuid(),
  scenarioId: z.string().min(1),
  scenarioVersion: z.number().int().positive(),
  targetEnvironmentId: z.string().min(1),
  personaId: z.string().min(1),
  status: RunStatusSchema,
  randomSeed: z.string().min(1),
  commitSha: z.string().optional(),
  branch: z.string().optional(),
  modelName: z.string().optional(),
  modelProfile: z.string().optional(),
  promptVersion: z.string().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  configuration: z.record(z.unknown()).optional(),
});

export type EvolutionRun = z.infer<typeof EvolutionRunSchema>;

export const ScenarioDefinitionSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string().optional(),
  risk: z.enum(['low', 'medium', 'high']),
  target: z.object({
    capabilities: z.array(z.string()),
  }),
  persona: z.object({
    role: z.string(),
    experience: z.string().optional(),
  }),
  fixture: z.record(z.unknown()).optional(),
  goal: z.object({
    action: z.string(),
  }),
  steps: z.array(z.string()),
  expected: z.record(z.unknown()),
  evaluators: z.array(z.string()),
  timeoutMs: z.number().int().positive().optional(),
  maxAttempts: z.number().int().positive().optional(),
  tags: z.array(z.string()).optional(),
  execution: z.enum(['deterministic', 'plan']).optional(),
});

export type ScenarioDefinition = z.infer<typeof ScenarioDefinitionSchema>;

export const EvidenceItemSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  kind: z.enum([
    'screenshot',
    'trace',
    'log',
    'api',
    'audit',
    'database',
    'model',
    'observation',
  ]),
  label: z.string(),
  path: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
  capturedAt: z.string().datetime(),
});

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export const EvaluationResultSchema = z.object({
  runId: z.string().uuid(),
  evaluatorId: z.string(),
  passed: z.boolean(),
  severity: z.enum(['info', 'low', 'medium', 'high', 'critical']).optional(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

export const FindingSchema = z.object({
  runId: z.string().uuid(),
  scenarioId: z.string(),
  targetEnvironmentId: z.string(),
  category: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  confidence: z.number().min(0).max(1),
  title: z.string(),
  expectedResult: z.string(),
  actualResult: z.string(),
  reproducible: z.boolean(),
  evidenceIds: z.array(z.string()),
  affectedComponents: z.array(z.string()),
  fingerprint: z.string(),
  recommendedAction: z.enum(['generate_test', 'human_review', 'replay', 'none']),
});

export type Finding = z.infer<typeof FindingSchema>;

export const HumanDecisionSchema = z.object({
  decisionId: z.string().uuid(),
  runId: z.string().uuid(),
  actor: z.string(),
  decision: z.enum([
    'approve_reproduction',
    'reject_finding',
    'request_replay',
    'approve_test_candidate',
    'reject_test_candidate',
    'allow_patch_candidate',
    'reject_patch_candidate',
    'approve_for_manual_merge',
    'block_scenario',
    'block_model_profile',
    'cancel_run',
  ]),
  comment: z.string().optional(),
  previousStatus: RunStatusSchema,
  newStatus: RunStatusSchema,
  decidedAt: z.string().datetime(),
});

export type HumanDecision = z.infer<typeof HumanDecisionSchema>;

export const SimulatedUserActionSchema = z.object({
  tool: z.enum([
    'browser.open',
    'browser.click',
    'browser.fill',
    'browser.select',
    'browser.press',
    'browser.read',
    'browser.screenshot',
    'browser.accessibilitySnapshot',
  ]),
  target: z.string().optional(),
  value: z.string().optional(),
  rationale: z.string().optional(),
});

export type SimulatedUserAction = z.infer<typeof SimulatedUserActionSchema>;
