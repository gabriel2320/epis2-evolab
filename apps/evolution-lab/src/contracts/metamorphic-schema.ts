import { z } from 'zod';

export const MetamorphicRelationTypeSchema = z.enum([
  'inversion',
  'permission_monotonicity',
  'idempotence',
  'conservation',
  'symmetry',
]);

export const CompareTypeSchema = z.enum([
  'snapshot_equal',
  'outcome_implication',
  'delta',
  'invariant_repeat',
  'audit_delta',
]);

export const RelationSideOverridesSchema = z
  .object({
    persona: z.object({ role: z.string() }).partial().optional(),
    expected: z.record(z.unknown()).optional(),
    fixture: z.record(z.unknown()).optional(),
  })
  .optional();

export const RelationSideSchema = z.object({
  scenario: z.string().min(1),
  overrides: RelationSideOverridesSchema,
});

export const FollowUpSideSchema = RelationSideSchema.extend({
  repeat: z.number().int().positive().optional(),
  reuseContext: z.array(z.string()).optional(),
  resetFixturesBetween: z.boolean().optional(),
});

export const VerifyClauseSchema = z.object({
  compare: CompareTypeSchema,
  left: z
    .object({
      run: z.enum(['source', 'followUp']),
      observation: z.string(),
      followUpIndex: z.number().int().nonnegative().optional(),
    })
    .optional(),
  right: z
    .object({
      run: z.enum(['source', 'followUp']),
      observation: z.string(),
      followUpIndex: z.number().int().nonnegative().optional(),
    })
    .optional(),
  fields: z.array(z.string()).optional(),
  tolerance: z.number().nonnegative().optional(),
  premise: z
    .object({
      run: z.enum(['source', 'followUp']),
      observation: z.string(),
      outcome: z.enum(['allowed', 'blocked']),
      followUpIndex: z.number().int().nonnegative().optional(),
    })
    .optional(),
  conclusion: z
    .object({
      run: z.enum(['source', 'followUp']),
      observation: z.string(),
      outcome: z.enum(['allowed', 'blocked']),
      followUpIndex: z.number().int().nonnegative().optional(),
    })
    .optional(),
  permission: z.string().optional(),
  observation: z.string().optional(),
  field: z.string().optional(),
  expected: z.union([z.number(), z.boolean(), z.string()]).optional(),
  equals: z.union([z.number(), z.boolean(), z.string()]).optional(),
  required: z.array(z.string()).optional(),
  forbidden: z.array(z.string()).optional(),
  correlateBy: z.string().optional(),
});

export const MetamorphicRelationSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  kind: z.literal('metamorphic'),
  relation: MetamorphicRelationTypeSchema,
  name: z.string().min(1),
  risk: z.enum(['low', 'medium', 'high']),
  source: RelationSideSchema,
  followUp: FollowUpSideSchema.optional(),
  verify: z.array(VerifyClauseSchema).min(1),
  onViolation: z.object({
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    category: z.string().min(1),
  }),
  requiresHumanReview: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export type MetamorphicRelation = z.infer<typeof MetamorphicRelationSchema>;
export type VerifyClause = z.infer<typeof VerifyClauseSchema>;
