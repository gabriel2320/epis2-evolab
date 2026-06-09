import { describe, expect, it } from 'vitest';
import { loadScenario } from '../scenarios/loader.js';
import { fallbackPlanFromScenario } from './agent.js';
import { buildSimulatedUserPrompt } from './prompts.js';
import { SimulatedUserPlanSchema } from './schemas.js';

describe('simulated-user', () => {
  it('prompt incluye id, persona y pasos del escenario RBAC', () => {
    const scenario = loadScenario('role-evolution-sign-001');
    const prompt = buildSimulatedUserPrompt(scenario);
    expect(prompt).toContain('role-evolution-sign-001');
    expect(prompt).toContain('login_admin');
    expect(prompt).toContain('"actionBlocked": true');
  });

  it('fallbackPlanFromScenario mapea pasos YAML a channels', () => {
    const scenario = loadScenario('discharge-critical-pending-001');
    const plan = fallbackPlanFromScenario(scenario);
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.goalInterpretation).toBeTruthy();
    expect(SimulatedUserPlanSchema.safeParse(plan).success).toBe(true);
  });
});
