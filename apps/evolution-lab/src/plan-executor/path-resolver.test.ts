import { describe, expect, it } from 'vitest';
import { loadScenario } from '../scenarios/loader.js';
import type { SimulatedUserStep } from '../simulated-user/schemas.js';
import { resolvePlanTarget } from './path-resolver.js';

describe('plan-executor path-resolver', () => {
  it('normaliza ruta LLM de paciente DEMO-002 a ficha EPIS2', () => {
    const scenario = loadScenario('role-evolution-sign-001');
    const step: SimulatedUserStep = {
      stepId: 'open_patient',
      channel: 'browser',
      action: 'navegar',
      target: '/paciente/DEMO-002',
    };
    expect(resolvePlanTarget(step, scenario)).toBe(
      '/espacio/ficha?patientId=a0000001-0000-4000-8000-000000000002',
    );
  });

  it('normaliza borrador UUID a ruta EPIS2', () => {
    const scenario = loadScenario('role-evolution-sign-001');
    const step: SimulatedUserStep = {
      stepId: 'open_evolution_draft',
      channel: 'browser',
      action: 'abrir',
      target: '/evolucion/d0000001-0000-4000-8000-000000000001',
    };
    expect(resolvePlanTarget(step, scenario)).toBe(
      '/espacio/borrador/d0000001-0000-4000-8000-000000000001',
    );
  });

  it('resuelve evolución con fixture DEMO-001', () => {
    const scenario = loadScenario('llm-command-evolution-001');
    const step: SimulatedUserStep = {
      stepId: 'open_evolution_route',
      channel: 'browser',
      action: 'abrir',
      target: '/espacio/evolucion',
    };
    expect(resolvePlanTarget(step, scenario)).toBe(
      '/espacio/evolucion?patientId=a0000001-0000-4000-8000-000000000001',
    );
  });
});
