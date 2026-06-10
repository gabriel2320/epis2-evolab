import { getDemoCaseByCode } from '@evolab/demo-fixtures';
import type { ScenarioDefinition } from '../contracts/schemas.js';
import type {
  Epis2ApiTargetAdapter,
  Epis2BrowserTargetAdapter,
  TargetSession,
} from '../target/types.js';
import type { ScenarioObservation } from '../evaluators/types.js';
import {
  type ApiStep,
  type BrowserStep,
  type DeclarativeStep,
  isApiStep,
  isBrowserStep,
  isLoginStep,
  isWaitStep,
} from './schema.js';

export type StepEngineDeps = {
  api: Epis2ApiTargetAdapter;
  browser: Epis2BrowserTargetAdapter;
  session: TargetSession;
  writeApi: (label: string, payload: Record<string, unknown>) => string;
};

export type StepEngineResult = {
  observations: ScenarioObservation[];
  error?: string;
};

/** Contexto de placeholders: fixture (valores string) + demo case resuelto. */
export function buildStepContext(scenario: ScenarioDefinition): Record<string, string> {
  const ctx: Record<string, string> = {};
  const fixture = scenario.fixture ?? {};
  for (const [key, value] of Object.entries(fixture)) {
    if (typeof value === 'string') ctx[key] = value;
  }
  const demoCode = typeof fixture.demoCaseCode === 'string' ? fixture.demoCaseCode : undefined;
  if (demoCode) {
    const demo = getDemoCaseByCode(demoCode);
    if (demo?.patientId) ctx.patientId = demo.patientId;
  }
  return ctx;
}

export function resolvePlaceholders(template: string, ctx: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
    const value = ctx[key];
    if (value === undefined) {
      throw new Error(`Placeholder sin resolver: {${key}}`);
    }
    return value;
  });
}

function resolveBodyPlaceholders(
  body: Record<string, unknown>,
  ctx: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    out[key] = typeof value === 'string' ? resolvePlaceholders(value, ctx) : value;
  }
  return out;
}

async function executeApiStep(
  step: ApiStep['api'],
  ctx: Record<string, string>,
  deps: StepEngineDeps,
): Promise<ScenarioObservation> {
  const path = resolvePlaceholders(step.path, ctx);
  const body = step.body ? resolveBodyPlaceholders(step.body, ctx) : undefined;
  const res = await deps.api.apiRequest(deps.session, step.method, path, body);
  const evidenceLabel = step.evidenceLabel ?? step.label.replace(/_/g, '-');
  const evidencePath = deps.writeApi(evidenceLabel, {
    status: res.status,
    ok: res.ok,
    latencyMs: res.latencyMs,
    body: res.body,
  });
  return {
    kind: 'api_response',
    label: step.label,
    payload: {
      status: res.status,
      ok: res.ok,
      path: evidencePath,
    },
  };
}

async function executeBrowserStep(
  step: BrowserStep['browser'],
  ctx: Record<string, string>,
  deps: StepEngineDeps,
): Promise<ScenarioObservation | undefined> {
  if (step.open) {
    await deps.browser.open(resolvePlaceholders(step.open, ctx));
  }

  const payload: Record<string, unknown> = {};

  if (step.payload) {
    for (const [key, value] of Object.entries(step.payload)) {
      payload[key] = resolvePlaceholders(value, ctx);
    }
  }

  if (step.waitTestId) {
    const waited = await deps.browser.waitForTestId(step.waitTestId, step.waitTimeoutMs ?? 20_000);
    payload[step.waitAs ?? step.waitTestId] = waited;
  }

  if (step.visible) {
    for (const [key, check] of Object.entries(step.visible)) {
      if (typeof check === 'string') {
        payload[key] = await deps.browser.isVisible(check);
      } else if (check.ifKey !== undefined && payload[check.ifKey] !== true) {
        payload[key] = false;
      } else {
        payload[key] = await deps.browser.isVisible(check.testId);
      }
    }
  }

  if (step.screenshot) {
    await deps.browser.screenshot(step.screenshot);
  }

  if (step.label) {
    if (step.includeUrl !== false) {
      payload.url = await deps.browser.currentUrl();
    }
    return { kind: 'dom_state', label: step.label, payload };
  }
  return undefined;
}

export async function executeDeclarativeSteps(
  scenario: ScenarioDefinition,
  steps: DeclarativeStep[],
  deps: StepEngineDeps,
): Promise<StepEngineResult> {
  const observations: ScenarioObservation[] = [];
  let ctx: Record<string, string>;
  try {
    ctx = buildStepContext(scenario);
  } catch (err) {
    return { observations, error: err instanceof Error ? err.message : String(err) };
  }

  const fixture = scenario.fixture ?? {};
  if (typeof fixture.demoCaseCode === 'string' && !getDemoCaseByCode(fixture.demoCaseCode)) {
    return { observations, error: `demoCaseCode desconocido: ${fixture.demoCaseCode}` };
  }

  for (const [index, step] of steps.entries()) {
    try {
      if (isLoginStep(step)) {
        observations.push({
          kind: 'session',
          label: step.login?.label ?? `login_${deps.session.role}`,
          payload: {
            username: deps.session.username,
            role: deps.session.role,
            synthetic: true,
          },
        });
      } else if (isApiStep(step)) {
        observations.push(await executeApiStep(step.api, ctx, deps));
      } else if (isBrowserStep(step)) {
        const obs = await executeBrowserStep(step.browser, ctx, deps);
        if (obs) observations.push(obs);
      } else if (isWaitStep(step)) {
        await new Promise((resolve) => setTimeout(resolve, step.wait.ms));
      }
    } catch (err) {
      return {
        observations,
        error: `Paso ${index + 1} falló: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return { observations };
}
