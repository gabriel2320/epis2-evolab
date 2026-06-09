import { getDemoCaseByCode } from '@evolab/demo-fixtures';
import type { ScenarioDefinition } from '../contracts/schemas.js';
import type { SimulatedUserStep } from '../simulated-user/schemas.js';

export function isPlanDrivenScenario(scenario: ScenarioDefinition): boolean {
  return (
    scenario.execution === 'plan' ||
    scenario.tags?.includes('llm_driven') === true ||
    scenario.id.startsWith('llm-')
  );
}

export function resolveDemoPatientId(scenario: ScenarioDefinition): string | undefined {
  const code = scenario.fixture?.demoCaseCode;
  if (typeof code !== 'string') return undefined;
  return getDemoCaseByCode(code)?.patientId;
}

export function resolvePlanTarget(step: SimulatedUserStep, scenario: ScenarioDefinition): string {
  const raw = step.target?.trim() ?? '';
  const patientId = resolveDemoPatientId(scenario);

  if (raw.startsWith('/espacio/') || raw.startsWith('/comando')) {
    if (raw.startsWith('/espacio/') && patientId && !raw.includes('?') && !raw.includes('/borrador/')) {
      return `${raw}?patientId=${patientId}`;
    }
    return raw;
  }

  const fixtureDraft = scenario.fixture?.draftId;
  const draftId =
    (typeof fixtureDraft === 'string' ? fixtureDraft : undefined) ??
    raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (
    draftId &&
    (raw.includes('borrador') ||
      raw.includes('draft') ||
      step.stepId.includes('draft') ||
      step.stepId.includes('borrador'))
  ) {
    return `/espacio/borrador/${draftId}`;
  }

  const demoCode =
    raw.match(/DEMO-\d{3}/i)?.[0] ??
    (typeof scenario.fixture?.demoCaseCode === 'string' ? scenario.fixture.demoCaseCode : undefined);
  const demo = demoCode ? getDemoCaseByCode(demoCode) : undefined;
  const pid = demo?.patientId ?? patientId;

  if (
    pid &&
    (raw.includes('ficha') ||
      raw.includes('patient') ||
      raw.includes('paciente') ||
      step.stepId.includes('patient') ||
      step.stepId.includes('pin_demo'))
  ) {
    return `/espacio/ficha?patientId=${pid}`;
  }
  if (
    pid &&
    (raw.includes('evolucion') ||
      raw.includes('evolution') ||
      step.stepId.includes('evolution') ||
      step.stepId.includes('evolucion') ||
      step.stepId.includes('open_evolution'))
  ) {
    return `/espacio/evolucion?patientId=${pid}`;
  }
  if (pid && (raw.includes('epicrisis') || raw.includes('discharge'))) {
    return `/espacio/epicrisis?patientId=${pid}`;
  }
  if (pid && raw.includes('mar')) {
    return `/espacio/mar?patientId=${pid}`;
  }
  if (raw.includes('buscar') || step.stepId.includes('search')) {
    return '/espacio/buscar-paciente';
  }
  if (raw.includes('comando') || raw.includes('command') || step.stepId.includes('command')) {
    return '/comando';
  }
  if (raw.startsWith('/api/')) return raw;
  if (step.stepId.includes('login')) return '/api/auth/login';

  return raw || (pid ? `/espacio/ficha?patientId=${pid}` : '/comando');
}

export function hasDeterministicExecutor(scenarioId: string): boolean {
  return (
    scenarioId === 'role-evolution-sign-001' ||
    scenarioId === 'discharge-critical-pending-001' ||
    scenarioId === 'suspended-medication-mar-001'
  );
}
