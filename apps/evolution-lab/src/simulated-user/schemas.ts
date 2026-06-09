import { z } from 'zod';

export const SimulatedUserStepSchema = z.object({
  stepId: z.string().min(1),
  channel: z.enum(['browser', 'api', 'command', 'observe']),
  action: z.string().min(1),
  target: z.string().optional(),
  naturalLanguage: z.string().optional(),
});

export type SimulatedUserStep = z.infer<typeof SimulatedUserStepSchema>;

export const SimulatedUserPlanSchema = z.object({
  personaSummary: z.string().min(1),
  goalInterpretation: z.string().min(1),
  steps: z.array(SimulatedUserStepSchema).min(1).max(12),
  riskNotes: z.string().optional(),
});

export type SimulatedUserPlan = z.infer<typeof SimulatedUserPlanSchema>;

export const FALLBACK_SIMULATED_USER_PLAN: SimulatedUserPlan = {
  personaSummary: 'Usuario clínico demo en sandbox sintético',
  goalInterpretation: 'Ejecutar pasos declarativos del escenario',
  steps: [{ stepId: 'observe', channel: 'observe', action: 'follow_scenario_executor' }],
};
