import { join } from 'node:path';
import type { EvolabConfig } from '../config/env.js';
import type { ScenarioDefinition } from '../contracts/schemas.js';
import type { EvidenceCollector, RunEvidenceBundle } from '../evidence/collector.js';
import { prepareScenarioFixture } from '../fixtures/sandbox-prep.js';
import { PlaywrightController } from '../browser/playwright-controller.js';
import { createNullBrowserAdapter } from '../target/null-browser-adapter.js';
import { createSimulatedUserAgent } from '../simulated-user/agent.js';
import type { SimulatedUserPlan } from '../simulated-user/schemas.js';
import type { Epis2BrowserTargetAdapter, TargetSession } from '../target/types.js';

/** Fase PREPARE: reset de fixtures sandbox (best-effort, u obligatorio con resetFixtures). */
export function runFixturePhase(
  scenario: ScenarioDefinition,
  collector: EvidenceCollector,
  bundle: RunEvidenceBundle,
  resetFixtures: boolean,
): void {
  const fixture = scenario.fixture as Record<string, unknown> | undefined;
  const fixturePrep = prepareScenarioFixture(fixture);
  collector.attachObservation(bundle, {
    kind: 'fixture_prep',
    label: 'sandbox_fixture',
    payload: fixturePrep,
  });
  if (fixture?.marDoseHeld === true || fixture?.medicationStatus === 'suspended') {
    collector.attachObservation(bundle, {
      kind: 'fixture_prep',
      label: 'mar_dose_held',
      payload: { held: fixturePrep.ok, marDoseId: fixture?.marDoseId },
    });
  }
  if (!fixturePrep.ok && !fixturePrep.skipped) {
    throw new Error(fixturePrep.message);
  }
  // --reset-fixtures: el reset del sandbox es obligatorio, no best-effort.
  if (resetFixtures && !fixturePrep.ok) {
    throw new Error(
      `Reset de fixtures requerido (--reset-fixtures) pero falló: ${fixturePrep.message}`,
    );
  }
}

/** Fase PLAN (llmSimMode != off): plan del simulated user + captura de evidencia. */
export async function runPlanPhase(
  config: EvolabConfig,
  scenario: ScenarioDefinition,
  collector: EvidenceCollector,
  bundle: RunEvidenceBundle,
): Promise<SimulatedUserPlan | undefined> {
  if (config.llmSimMode === 'off') return undefined;

  const agent = createSimulatedUserAgent(config);
  const planResult = await agent.planScenario(scenario);
  const planPath = collector.writeModelCapture(bundle, 'simulated-user-plan', {
    source: planResult.source,
    model: planResult.model,
    plan: planResult.plan,
    ...(planResult.error ? { error: planResult.error } : {}),
    ...(planResult.repaired ? { repaired: planResult.repaired } : {}),
  });
  collector.attachObservation(bundle, {
    kind: 'model',
    label: 'simulated_user_plan',
    payload: {
      source: planResult.source,
      model: planResult.model,
      stepCount: planResult.plan.steps.length,
      goalInterpretation: planResult.plan.goalInterpretation,
      artifactPath: planPath,
      ...(planResult.error ? { error: planResult.error } : {}),
    },
  });
  return planResult.plan;
}

/** Crea el adaptador browser del run: Playwright real o null adapter (API-first). */
export async function createRunBrowser(
  config: EvolabConfig,
  scenario: ScenarioDefinition,
  collector: EvidenceCollector,
  bundle: RunEvidenceBundle,
  session: TargetSession,
): Promise<{ browser: Epis2BrowserTargetAdapter; playwright?: PlaywrightController }> {
  if (!config.browserEnabled) {
    collector.attachObservation(bundle, {
      kind: 'runtime',
      label: 'browser_mode',
      payload: { mode: 'api_only', browserEnabled: false },
    });
    return { browser: createNullBrowserAdapter() };
  }

  const playwright = new PlaywrightController({
    webBaseUrl: config.webBaseUrl,
    headless: process.env.EPIS2_EVOLAB_HEADLESS !== 'false',
    timeoutMs: scenario.timeoutMs ?? 60_000,
    screenshotsDir: join(bundle.runDir, 'screenshots'),
  });
  await playwright.launch();
  await playwright.injectSessionCookies(config.apiBaseUrl, session.cookies);
  return { browser: playwright.createBrowserAdapter(), playwright };
}
