import { getDemoCaseByCode } from '@evolab/demo-fixtures';
import type { ScenarioDefinition } from '../contracts/schemas.js';
import type {
  Epis2ApiTargetAdapter,
  Epis2BrowserTargetAdapter,
  TargetSession,
} from '../target/types.js';
import type { ScenarioObservation } from '../evaluators/types.js';
import { getCustomStep } from './custom-steps.js';
import {
  type ApiStep,
  type BrowserStep,
  type DeclarativeStep,
  isApiStep,
  isBrowserStep,
  isCustomStep,
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

export type StepContext = Record<string, unknown>;

/** Contexto de placeholders: fixture + demo case (patientId, encounterId) + today. */
export function buildStepContext(scenario: ScenarioDefinition): StepContext {
  const ctx: StepContext = {};
  const fixture = scenario.fixture ?? {};
  for (const [key, value] of Object.entries(fixture)) {
    ctx[key] = value;
  }
  const demoCode = typeof fixture.demoCaseCode === 'string' ? fixture.demoCaseCode : undefined;
  if (demoCode) {
    const demo = getDemoCaseByCode(demoCode);
    if (demo) {
      ctx.patientId = demo.patientId;
      ctx.encounterId = demo.encounterId;
    }
  }
  ctx.today = new Date().toISOString().slice(0, 10);
  return ctx;
}

export function resolvePlaceholders(template: string, ctx: StepContext): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
    const value = ctx[key];
    if (value === undefined || value === null) {
      throw new Error(`Placeholder sin resolver: {${key}}`);
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    throw new Error(`Placeholder {${key}} no es un valor primitivo`);
  });
}

function resolveBodyPlaceholders(
  body: Record<string, unknown>,
  ctx: StepContext,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') {
      out[key] = resolvePlaceholders(value, ctx);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = resolveBodyPlaceholders(value as Record<string, unknown>, ctx);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function getByDotPath(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

async function executeApiStep(
  step: ApiStep['api'],
  ctx: StepContext,
  deps: StepEngineDeps,
): Promise<{ observation?: ScenarioObservation; error?: string }> {
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

  if (step.capture) {
    for (const [ctxKey, dotPath] of Object.entries(step.capture)) {
      const captured = getByDotPath(res.body, dotPath);
      if (captured === undefined && step.failOnMissingCapture) {
        return {
          error: step.failOnMissingCapture.replace('{status}', String(res.status)),
        };
      }
      ctx[ctxKey] = captured;
    }
  }

  let payload: Record<string, unknown>;
  if (step.observe?.payload) {
    payload = {};
    for (const key of step.observe.payload) {
      if (key === 'status') payload.status = res.status;
      else if (key === 'ok') payload.ok = res.ok;
      else if (key === 'path') payload.path = evidencePath;
      else payload[key] = ctx[key];
    }
  } else {
    payload = { status: res.status, ok: res.ok, path: evidencePath };
  }

  return {
    observation: {
      kind: step.observe?.kind ?? 'api_response',
      label: step.observe?.label ?? step.label,
      payload,
    },
  };
}

async function executeBrowserStep(
  step: BrowserStep['browser'],
  ctx: StepContext,
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
  const ctx = buildStepContext(scenario);

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
        const result = await executeApiStep(step.api, ctx, deps);
        if (result.error) {
          return { observations, error: result.error };
        }
        if (result.observation) observations.push(result.observation);
      } else if (isBrowserStep(step)) {
        const obs = await executeBrowserStep(step.browser, ctx, deps);
        if (obs) observations.push(obs);
      } else if (isCustomStep(step)) {
        const fn = getCustomStep(step.custom.name);
        if (!fn) {
          return {
            observations,
            error: `Paso custom desconocido: ${step.custom.name}`,
          };
        }
        const result = await fn({
          scenario,
          api: deps.api,
          browser: deps.browser,
          session: deps.session,
          writeApi: deps.writeApi,
          ctx,
          args: step.custom.args ?? {},
        });
        observations.push(...result.observations);
        if (result.capture) Object.assign(ctx, result.capture);
        if (result.error) {
          return { observations, error: result.error };
        }
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
