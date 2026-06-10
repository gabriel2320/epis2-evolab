import { getDemoCaseByCode } from '@evolab/demo-fixtures';
import { fallbackPlanFromScenario } from '../simulated-user/agent.js';
import type { SimulatedUserPlan } from '../simulated-user/schemas.js';
import type { ScenarioDefinition } from '../contracts/schemas.js';
import type {
  Epis2ApiTargetAdapter,
  Epis2BrowserTargetAdapter,
  TargetSession,
} from '../target/types.js';
import type { RunEvidenceBundle } from '../evidence/collector.js';
import type { ScenarioObservation } from '../evaluators/types.js';
import { executePlan } from '../plan-executor/executor.js';
import { hasDeterministicExecutor, isPlanDrivenScenario } from '../plan-executor/path-resolver.js';
import { executeDischargeCriticalPending001 } from './discharge-critical-pending.js';
import { executeSuspendedMedicationMar001 } from './suspended-medication-mar.js';

export type ScenarioExecutionResult = {
  observations: ScenarioObservation[];
  error?: string;
  executionMode?: 'deterministic' | 'plan' | 'plan_fallback';
};

const SEEDED_DRAFT_DEMO002 = 'd0000001-0000-4000-8000-000000000001';

export type ScenarioExecuteOptions = {
  plan?: SimulatedUserPlan;
  llmSimMode?: 'off' | 'plan' | 'execute';
  browserEnabled?: boolean;
};

export async function executeRoleEvolutionSign001(
  scenario: ScenarioDefinition,
  api: Epis2ApiTargetAdapter,
  browser: Epis2BrowserTargetAdapter,
  session: TargetSession,
  _evidence: RunEvidenceBundle,
  writeApi: (label: string, payload: Record<string, unknown>) => string,
): Promise<ScenarioExecutionResult> {
  const observations: ScenarioObservation[] = [];
  const fixture = scenario.fixture as Record<string, unknown> | undefined;
  const demoCode = String(fixture?.demoCaseCode ?? 'DEMO-002');
  const draftId = String(fixture?.draftId ?? SEEDED_DRAFT_DEMO002);
  const demo = getDemoCaseByCode(demoCode);
  if (!demo) {
    return { observations, error: `demoCaseCode desconocido: ${demoCode}` };
  }

  observations.push({
    kind: 'session',
    label: 'login_admin',
    payload: { username: session.username, role: session.role, synthetic: true },
  });

  await browser.open('/comando');
  await browser.open(`/espacio/ficha?patientId=${demo.patientId}`);
  await browser.screenshot('01-patient-workspace');

  await browser.open(`/espacio/borrador/${draftId}`);
  const draftReviewVisible = await browser.waitForTestId('epis2-draft-review', 20_000);
  const forbiddenVisible = await browser.isVisible('epis2-forbidden');
  const approveButtonVisible = draftReviewVisible
    ? await browser.isVisible('epis2-draft-approve')
    : false;
  await browser.screenshot('02-draft-review-admin');

  observations.push({
    kind: 'dom_state',
    label: 'draft_review_dom',
    payload: {
      draftId,
      draftReviewVisible,
      forbiddenVisible,
      approveButtonVisible,
      url: await browser.currentUrl(),
    },
  });

  const approveAttempt = await api.apiRequest(session, 'POST', `/api/drafts/${draftId}/approve`);
  const apiPath = writeApi('approve-attempt', {
    status: approveAttempt.status,
    ok: approveAttempt.ok,
    latencyMs: approveAttempt.latencyMs,
    body: approveAttempt.body,
  });

  observations.push({
    kind: 'api_response',
    label: 'approve_attempt',
    payload: {
      status: approveAttempt.status,
      ok: approveAttempt.ok,
      path: apiPath,
    },
  });

  return { observations, executionMode: 'deterministic' };
}

async function executeDeterministic(
  scenario: ScenarioDefinition,
  deps: {
    api: Epis2ApiTargetAdapter;
    browser: Epis2BrowserTargetAdapter;
    session: TargetSession;
    evidence: RunEvidenceBundle;
    writeApi: (label: string, payload: Record<string, unknown>) => string;
  },
): Promise<ScenarioExecutionResult> {
  switch (scenario.id) {
    case 'role-evolution-sign-001':
      return executeRoleEvolutionSign001(
        scenario,
        deps.api,
        deps.browser,
        deps.session,
        deps.evidence,
        deps.writeApi,
      );
    case 'discharge-critical-pending-001':
      return {
        ...(await executeDischargeCriticalPending001(
          scenario,
          deps.api,
          deps.browser,
          deps.session,
          deps.evidence,
          deps.writeApi,
        )),
        executionMode: 'deterministic',
      };
    case 'suspended-medication-mar-001':
      return {
        ...(await executeSuspendedMedicationMar001(
          scenario,
          deps.api,
          deps.browser,
          deps.session,
          deps.evidence,
          deps.writeApi,
        )),
        executionMode: 'deterministic',
      };
    default:
      return {
        observations: [],
        error: `Ejecutor no implementado para escenario: ${scenario.id} (status=blocked_by_missing_capability)`,
      };
  }
}

export async function executeScenario(
  scenario: ScenarioDefinition,
  deps: {
    api: Epis2ApiTargetAdapter;
    browser: Epis2BrowserTargetAdapter;
    apiBaseUrl: string;
    webBaseUrl: string;
    evidence: RunEvidenceBundle;
    writeApi: (label: string, payload: Record<string, unknown>) => string;
    session: TargetSession;
  },
  opts: ScenarioExecuteOptions = {},
): Promise<ScenarioExecutionResult> {
  const planDriven = isPlanDrivenScenario(scenario);
  const llmSimMode = opts.llmSimMode ?? 'off';

  if (planDriven) {
    if (llmSimMode !== 'execute') {
      return {
        observations: [],
        error: `Escenario ${scenario.id} requiere EPIS2_EVOLAB_LLM_SIM=execute`,
      };
    }
    const plan = opts.plan ?? fallbackPlanFromScenario(scenario);
    return {
      ...(await executePlan(plan, scenario, {
        api: deps.api,
        browser: deps.browser,
        session: deps.session,
        writeApi: deps.writeApi,
        browserEnabled: opts.browserEnabled ?? false,
      })),
      executionMode: 'plan',
    };
  }

  if (llmSimMode === 'execute' && opts.plan) {
    const planResult = await executePlan(opts.plan, scenario, {
      api: deps.api,
      browser: deps.browser,
      session: deps.session,
      writeApi: deps.writeApi,
      browserEnabled: opts.browserEnabled ?? false,
    });
    const summary = planResult.observations.find(
      (o) => o.kind === 'plan_execution' && o.label === 'summary',
    );
    const failed = Number(summary?.payload.failed ?? 0);
    if (failed === 0) {
      return { ...planResult, executionMode: 'plan' };
    }
    if (hasDeterministicExecutor(scenario.id)) {
      const deterministic = await executeDeterministic(scenario, deps);
      return {
        observations: [...planResult.observations, ...deterministic.observations],
        ...(deterministic.error ? { error: deterministic.error } : {}),
        executionMode: 'plan_fallback',
      };
    }
    return { ...planResult, executionMode: 'plan' };
  }

  return executeDeterministic(scenario, deps);
}
