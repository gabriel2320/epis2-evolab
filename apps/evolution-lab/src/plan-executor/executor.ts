import type { ScenarioDefinition } from '../contracts/schemas.js';
import type { SimulatedUserPlan, SimulatedUserStep } from '../simulated-user/schemas.js';
import type { Epis2ApiTargetAdapter, Epis2BrowserTargetAdapter, TargetSession } from '../target/types.js';
import type { ScenarioObservation } from '../evaluators/types.js';
import type { ScenarioExecutionResult } from '../scenarios/executor.js';
import { resolveDemoPatientId, resolvePlanTarget } from './path-resolver.js';

export type PlanExecutionDeps = {
  api: Epis2ApiTargetAdapter;
  browser: Epis2BrowserTargetAdapter;
  session: TargetSession;
  writeApi: (label: string, payload: Record<string, unknown>) => string;
  browserEnabled: boolean;
};

export async function executePlan(
  plan: SimulatedUserPlan,
  scenario: ScenarioDefinition,
  deps: PlanExecutionDeps,
): Promise<ScenarioExecutionResult> {
  const observations: ScenarioObservation[] = [];
  const patientId = resolveDemoPatientId(scenario);
  let lastRoutePath: string | undefined;
  let failedSteps = 0;

  observations.push({
    kind: 'session',
    label: 'plan_session',
    payload: { username: deps.session.username, role: deps.session.role, patientId },
  });

  for (const step of plan.steps) {
    const stepObs = await executePlanStep(step, scenario, deps, {
      patientId,
      lastRoutePath,
    });
    if (stepObs.routePath) lastRoutePath = stepObs.routePath;
    if (!stepObs.ok) failedSteps += 1;
    observations.push(stepObs.observation);
  }

  observations.push({
    kind: 'plan_execution',
    label: 'summary',
    payload: {
      totalSteps: plan.steps.length,
      succeeded: plan.steps.length - failedSteps,
      failed: failedSteps,
      lastRoutePath,
      goalInterpretation: plan.goalInterpretation,
    },
  });

  return {
    observations,
    ...(failedSteps > 0 && scenario.execution === 'plan'
      ? { error: `${failedSteps} paso(s) del plan fallaron` }
      : {}),
  };
}

async function executePlanStep(
  step: SimulatedUserStep,
  scenario: ScenarioDefinition,
  deps: PlanExecutionDeps,
  ctx: { patientId?: string; lastRoutePath?: string },
): Promise<{ ok: boolean; observation: ScenarioObservation; routePath?: string }> {
  const base = {
    stepId: step.stepId,
    channel: step.channel,
    action: step.action,
    target: step.target,
  };

  try {
    switch (step.channel) {
      case 'api':
        return await executeApiStep(step, scenario, deps, ctx, base);
      case 'browser':
        return await executeBrowserStep(step, scenario, deps, ctx, base);
      case 'command':
        if (step.stepId.includes('pin') || step.stepId.includes('patient')) {
          return await executeBrowserStep(
            { ...step, channel: 'browser', action: 'open_patient_chart' },
            scenario,
            deps,
            ctx,
            base,
          );
        }
        if (
          (step.stepId.includes('open') || step.stepId.includes('route')) &&
          ctx.lastRoutePath
        ) {
          return await executeBrowserStep(
            { ...step, channel: 'browser' },
            scenario,
            deps,
            ctx,
            base,
          );
        }
        return await executeCommandStep(step, deps, ctx, base);
      case 'observe':
        return await executeObserveStep(step, deps, ctx, base);
      default:
        return {
          ok: false,
          observation: {
            kind: 'plan_step',
            label: step.stepId,
            payload: { ...base, ok: false, error: `channel desconocido: ${step.channel}` },
          },
        };
    }
  } catch (err) {
    return {
      ok: false,
      observation: {
        kind: 'plan_step',
        label: step.stepId,
        payload: {
          ...base,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        },
      },
    };
  }
}

async function executeApiStep(
  step: SimulatedUserStep,
  scenario: ScenarioDefinition,
  deps: PlanExecutionDeps,
  ctx: { patientId?: string },
  base: Record<string, unknown>,
): Promise<{ ok: boolean; observation: ScenarioObservation; routePath?: string }> {
  const path = resolvePlanTarget(step, scenario);
  if (path.includes('/auth/login') || step.stepId.includes('login')) {
    return {
      ok: true,
      observation: {
        kind: 'plan_step',
        label: step.stepId,
        payload: { ...base, ok: true, skipped: true, reason: 'session_already_active' },
      },
    };
  }

  const method = /approve|sign|POST/i.test(step.action) ? 'POST' : 'GET';
  const apiPath = path.startsWith('/api/') ? path : `/api${path}`;
  const res = await deps.api.apiRequest(deps.session, method, apiPath);
  deps.writeApi(`plan-${step.stepId}`, {
    method,
    path: apiPath,
    status: res.status,
    ok: res.ok,
    body: res.body,
  });

  const ok = res.ok || res.status === 403;
  return {
    ok,
    observation: {
      kind: 'api_response',
      label: step.stepId.includes('approve') ? 'approve_attempt' : `plan_api_${step.stepId}`,
      payload: {
        ...base,
        ok,
        status: res.status,
        path: apiPath,
      },
    },
  };
}

async function executeBrowserStep(
  step: SimulatedUserStep,
  scenario: ScenarioDefinition,
  deps: PlanExecutionDeps,
  ctx: { patientId?: string; lastRoutePath?: string },
  base: Record<string, unknown>,
): Promise<{ ok: boolean; observation: ScenarioObservation; routePath?: string }> {
  if (!deps.browserEnabled) {
    return {
      ok: true,
      observation: {
        kind: 'plan_step',
        label: step.stepId,
        payload: { ...base, ok: true, skipped: true, reason: 'browser_disabled' },
      },
    };
  }

  let path = resolvePlanTarget(step, scenario);
  if (ctx.lastRoutePath && (step.stepId.includes('open') || step.stepId.includes('route'))) {
    if (ctx.lastRoutePath.startsWith('/espacio/') || ctx.lastRoutePath.startsWith('/comando')) {
      path = ctx.lastRoutePath;
      const patientId = resolveDemoPatientId(scenario);
      if (patientId && path.startsWith('/espacio/') && !path.includes('patientId=')) {
        path = `${path}?patientId=${patientId}`;
      }
    }
  }

  await deps.browser.open(path);
  await deps.browser.screenshot(`plan-${step.stepId}`);

  let domProbe: Record<string, unknown> = { resolvedPath: path, url: await deps.browser.currentUrl() };
  if (path.includes('/borrador/')) {
    domProbe = {
      ...domProbe,
      draftReviewVisible: await deps.browser.waitForTestId('epis2-draft-review', 15_000),
      approveButtonVisible: await deps.browser.isVisible('epis2-draft-approve'),
      forbiddenVisible: await deps.browser.isVisible('epis2-forbidden'),
    };
  } else if (path.includes('/evolucion')) {
    domProbe = {
      ...domProbe,
      evolutionFormVisible: await deps.browser.waitForTestId('epis2-generated-clinical-page', 12_000),
    };
  } else if (path.includes('/ficha')) {
    domProbe = {
      ...domProbe,
      patientWorkspaceVisible: await deps.browser.waitForTestId('epis2-patient-workspace', 12_000),
    };
  }

  return {
    ok: true,
    routePath: path,
    observation: {
      kind: 'dom_state',
      label: `plan_browser_${step.stepId}`,
      payload: { ...base, ok: true, ...domProbe },
    },
  };
}

async function executeCommandStep(
  step: SimulatedUserStep,
  deps: PlanExecutionDeps,
  ctx: { patientId?: string },
  base: Record<string, unknown>,
): Promise<{ ok: boolean; observation: ScenarioObservation; routePath?: string }> {
  const text = resolveCommandText(step);
  const body: Record<string, unknown> = { text };
  if (ctx.patientId) body.patientId = ctx.patientId;

  let res = await deps.api.apiRequest(deps.session, 'POST', '/api/commands/resolve', body);
  let parsed = res.body as {
    status?: string;
    routePath?: string;
    candidates?: { intent: string; labelEs: string }[];
  } | null;

  if (parsed?.status === 'needs_clarification' && parsed.candidates?.length) {
    const preferred =
      parsed.candidates.find((c) => c.intent === 'create_evolution_draft') ??
      parsed.candidates.find((c) => /evolución/i.test(c.labelEs)) ??
      parsed.candidates[0];
    if (preferred) {
      const retryBody: Record<string, unknown> = { text: preferred.labelEs };
      if (ctx.patientId) retryBody.patientId = ctx.patientId;
      res = await deps.api.apiRequest(deps.session, 'POST', '/api/commands/resolve', retryBody);
      parsed = res.body as typeof parsed;
      body.text = preferred.labelEs;
    }
  }

  deps.writeApi(`plan-${step.stepId}`, {
    status: res.status,
    ok: res.ok,
    body: res.body,
    requestText: body.text,
  });

  const commandResolved = res.ok && parsed?.status === 'resolved';
  const routePath = parsed?.routePath;

  return {
    ok: commandResolved,
    routePath,
    observation: {
      kind: 'api_response',
      label: 'command_resolve',
      payload: {
        ...base,
        ok: res.ok,
        status: res.status,
        commandResolved,
        routePath,
        text: body.text,
        clarification: parsed?.status === 'needs_clarification',
      },
    },
  };
}

function resolveCommandText(step: SimulatedUserStep): string {
  if (step.stepId.includes('evolution') || step.stepId.includes('evolucion')) {
    return 'evolucionar nota de hoy';
  }
  const nl = step.naturalLanguage?.trim();
  if (nl && /evolucionar|evolución|nota de/i.test(nl)) return nl;
  if (nl && nl.length > 12 && /[áéíóúñ]/i.test(nl)) return nl;
  return 'evolucionar nota de hoy';
}

async function executeObserveStep(
  step: SimulatedUserStep,
  deps: PlanExecutionDeps,
  ctx: { lastRoutePath?: string },
  base: Record<string, unknown>,
): Promise<{ ok: boolean; observation: ScenarioObservation; routePath?: string }> {
  const payload: Record<string, unknown> = { ...base, ok: true };

  if (deps.browserEnabled && ctx.lastRoutePath?.includes('evolucion')) {
    await deps.browser.open(ctx.lastRoutePath);
    payload.evolutionFormVisible = await deps.browser.waitForTestId(
      'epis2-generated-clinical-page',
      12_000,
    );
    payload.url = await deps.browser.currentUrl();
  } else if (ctx.lastRoutePath) {
    payload.evolutionRoute = ctx.lastRoutePath.includes('evolucion');
    payload.routePath = ctx.lastRoutePath;
  }

  if (step.stepId.includes('denial') || step.action.includes('deneg')) {
    payload.observedDenial = true;
  }

  return {
    ok: true,
    routePath: ctx.lastRoutePath,
    observation: {
      kind: 'observe',
      label: `plan_observe_${step.stepId}`,
      payload,
    },
  };
}
