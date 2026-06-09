import { randomUUID } from 'node:crypto';

import { join } from 'node:path';

import type { EvolabConfig } from '../config/env.js';

import { assertGuardsPass, runSecurityGuards } from '../security/guards.js';

import { resolveTargetEnvironment } from '../security/target-allowlist.js';

import { createLogger } from '../logger.js';

import { transition } from '../state-machine/transitions.js';

import type { EvaluationResult, EvolutionRun, RunStatus } from '../contracts/schemas.js';

import { loadScenario } from '../scenarios/loader.js';

import { prepareScenarioFixture } from '../fixtures/sandbox-prep.js';

import { Epis2ApiTargetAdapterImpl } from '../target/epis2-api-target-adapter.js';

import { PlaywrightController } from '../browser/playwright-controller.js';

import { createNullBrowserAdapter } from '../target/null-browser-adapter.js';

import { EvidenceCollector } from '../evidence/collector.js';

import { executeScenario } from '../scenarios/executor.js';

import {

  allPassed,

  runDeterministicEvaluators,

  type ScenarioObservation,

} from '../evaluators/types.js';

import { buildEvaluatorsForScenario } from '../evaluators/deterministic.js';

import { createFindingsFromEvaluations } from '../findings/creator.js';
import { persistRunBundle } from '../persistence/repository.js';
import { createSimulatedUserAgent } from '../simulated-user/agent.js';
import type { SimulatedUserPlan } from '../simulated-user/schemas.js';
import { isPlanDrivenScenario } from '../plan-executor/path-resolver.js';
import { resolveDemoPersona } from '../resources/demo-users.js';

import type { Epis2ApiTargetAdapter, Epis2BrowserTargetAdapter } from '../target/types.js';



const log = createLogger('orchestrator');



export type OrchestratorResult = {

  run: EvolutionRun;

  guardReport: ReturnType<typeof runSecurityGuards>;

  message: string;

  evaluations?: EvaluationResult[];

  evidenceDir?: string;

  finalStatus?: RunStatus;

  findingsCount?: number;

};



function isTransientError(message: string): boolean {

  return (

    /no alcanzable|ECONNREFUSED|fetch failed|timeout|ETIMEDOUT|503|502|504/i.test(message)

  );

}



async function captureAuditTrail(

  api: Epis2ApiTargetAdapter,

  writeApi: (label: string, payload: Record<string, unknown>) => string,

): Promise<ScenarioObservation> {

  try {

    const auditor = resolveDemoPersona('auditor');

    const session = await api.login(auditor.username, auditor.demoAuthKey);

    const res = await api.apiRequest(session, 'GET', '/api/audit/events?limit=80');

    writeApi('audit-events-post-run', {

      status: res.status,

      ok: res.ok,

      body: res.body,

    });

    const body = res.body as { events?: unknown[] } | null;

    return {

      kind: 'audit_trail',

      label: 'post_run_events',

      payload: {

        status: res.status,

        eventCount: body?.events?.length ?? 0,

        events: body?.events ?? [],

      },

    };

  } catch (err) {

    return {

      kind: 'audit_trail',

      label: 'post_run_events',

      payload: {

        error: err instanceof Error ? err.message : String(err),

        events: [],

      },

    };

  }

}



export class EvolutionOrchestrator {

  constructor(private readonly config: EvolabConfig) {}



  async prepareRun(scenarioId: string, seed?: string): Promise<OrchestratorResult> {

    const { run, guardReport } = this.buildRun(scenarioId, seed);

    log.info('Run preparado', { runId: run.id, scenarioId, status: run.status });

    return {

      run,

      guardReport,

      message: `Run ${run.id} preparado — escenario ${scenarioId} v${run.scenarioVersion}`,

    };

  }



  async executeRun(scenarioId: string, seed?: string): Promise<OrchestratorResult> {

    const scenario = loadScenario(scenarioId);

    const maxAttempts = Math.min(

      scenario.maxAttempts ?? this.config.maxScenarioAttempts,

      this.config.maxScenarioAttempts,

    );



    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {

      try {

        return await this.runOnce(scenarioId, seed, attempt);

      } catch (err) {

        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt >= maxAttempts || !isTransientError(lastError.message)) {

          throw lastError;

        }

        log.warn('Reintento de escenario', {

          scenarioId,

          attempt,

          maxAttempts,

          error: lastError.message,

        });

      }

    }

    throw lastError ?? new Error('Run fallido sin detalle');

  }



  private async runOnce(

    scenarioId: string,

    seed: string | undefined,

    attempt: number,

  ): Promise<OrchestratorResult> {

    const guardReport = runSecurityGuards(this.config);

    if (!guardReport.ok) {

      throw new Error(`Guards fallaron: ${guardReport.blockedReason}`);

    }

    assertGuardsPass(this.config);



    const scenario = loadScenario(scenarioId);

    const target = resolveTargetEnvironment(this.config.targetId);

    if (!target) {

      throw new Error(`Target no resuelto: ${this.config.targetId}`);

    }



    const { run } = this.buildRun(scenarioId, seed);

    const collector = new EvidenceCollector(this.config.reportsDir);

    const bundle = collector.prepare(run, scenario);

    collector.writeLog(bundle, 'run', [

      `scenario=${scenarioId}`,

      `attempt=${attempt}`,

      `browser=${this.config.browserEnabled}`,

      `seed=${run.randomSeed}`,

    ]);



    const api = new Epis2ApiTargetAdapterImpl(this.config.apiBaseUrl);

    let status = run.status;

    let playwright: PlaywrightController | undefined;

    let simulatedPlan: SimulatedUserPlan | undefined;



    const deadline = Date.now() + this.config.globalTimeoutMs;

    const checkDeadline = () => {

      if (Date.now() > deadline) {

        throw new Error(`Timeout global (${this.config.globalTimeoutMs}ms) excedido`);

      }

    };



    try {

      checkDeadline();

      status = transition(status, 'starting_target');

      run.status = status;



      const health = await api.health();

      if (!health.ok) {

        throw new Error(

          `EPIS2 API no alcanzable (${this.config.apiBaseUrl}/health) — ejecutar stack sandbox`,

        );

      }

      collector.attachObservation(bundle, {

        kind: 'target_health',

        label: 'api_health',

        payload: health,

      });



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



      if (this.config.llmSimMode !== 'off') {

        const agent = createSimulatedUserAgent(this.config);

        const planResult = await agent.planScenario(scenario);

        simulatedPlan = planResult.plan;

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

      }



      checkDeadline();

      status = transition(status, 'running');

      run.status = status;



      const creds = resolveDemoPersona(scenario.persona.role);

      const session = await api.login(creds.username, creds.demoAuthKey);



      let browser: Epis2BrowserTargetAdapter;

      if (this.config.browserEnabled) {

        playwright = new PlaywrightController({

          webBaseUrl: this.config.webBaseUrl,

          headless: process.env.EPIS2_EVOLAB_HEADLESS !== 'false',

          timeoutMs: scenario.timeoutMs ?? 60_000,

          screenshotsDir: join(bundle.runDir, 'screenshots'),

        });

        await playwright.launch();

        await playwright.injectSessionCookies(this.config.apiBaseUrl, session.cookies);

        browser = playwright.createBrowserAdapter();

      } else {

        browser = createNullBrowserAdapter();

        collector.attachObservation(bundle, {

          kind: 'runtime',

          label: 'browser_mode',

          payload: { mode: 'api_only', browserEnabled: false },

        });

      }



      checkDeadline();

      const execution = await executeScenario(scenario, {

        api,

        browser,

        apiBaseUrl: this.config.apiBaseUrl,

        webBaseUrl: this.config.webBaseUrl,

        evidence: bundle,

        writeApi: (label, payload) => collector.writeApiCapture(bundle, label, payload),

        session,

      }, {

        ...(simulatedPlan ? { plan: simulatedPlan } : {}),

        llmSimMode: this.config.llmSimMode,

        browserEnabled: this.config.browserEnabled,

      });



      if (execution.executionMode) {

        collector.attachObservation(bundle, {

          kind: 'runtime',

          label: 'execution_mode',

          payload: { mode: execution.executionMode },

        });

      }



      if (scenario.expected.auditEventCreated === true) {

        collector.attachObservation(

          bundle,

          await captureAuditTrail(api, (label, payload) =>

            collector.writeApiCapture(bundle, label, payload),

          ),

        );

      }



      for (const obs of execution.observations) {

        collector.attachObservation(bundle, obs);

      }



      if (execution.error && !isPlanDrivenScenario(scenario)) {

        throw new Error(execution.error);

      }



      checkDeadline();

      status = transition(status, 'collecting_evidence');

      run.status = status;

      status = transition(status, 'evaluating');

      run.status = status;



      const observations = bundle.observations as ScenarioObservation[];

      const evalCtx = {

        runId: run.id,

        scenarioId: scenario.id,

        expected: scenario.expected,

        observations,

      };

      const evaluators = buildEvaluatorsForScenario(scenario);

      const evaluations = runDeterministicEvaluators(evaluators, evalCtx);

      const findings = createFindingsFromEvaluations({

        runId: run.id,

        scenarioId: scenario.id,

        targetEnvironmentId: run.targetEnvironmentId,

        evaluations,

      });



      const passed = allPassed(evaluations);

      if (passed) {

        status = transition(status, 'passed');

        status = transition(status, 'completed');

      } else if (this.config.requireHumanApproval) {

        status = transition(status, 'human_review');

      } else {

        status = transition(status, 'failed');

      }



      run.status = status;

      run.completedAt = new Date().toISOString();

      collector.finalize(bundle, run, evaluations, status, findings);

      await this.persistRun(run, evaluations, findings, bundle.runDir, status);

      log.info('Run completado', {

        runId: run.id,

        status,

        passed,

        findings: findings.length,

        attempt,

      });



      return {

        run,

        guardReport,

        evaluations,

        evidenceDir: bundle.runDir,

        finalStatus: status,

        findingsCount: findings.length,

        message: passed

          ? `Run ${run.id} PASSED — escenario ${scenarioId}`

          : findings.length > 0

            ? `Run ${run.id} — ${findings.length} hallazgo(s) — escenario ${scenarioId}`

            : `Run ${run.id} requiere revisión — escenario ${scenarioId}`,

      };

    } catch (err) {

      const message = err instanceof Error ? err.message : String(err);

      run.status = transition(run.status, 'failed');

      run.completedAt = new Date().toISOString();

      collector.finalize(
        bundle,
        run,
        [
          {
            runId: run.id,
            evaluatorId: 'orchestrator',
            passed: false,
            severity: 'critical',
            message,
          },
        ],
        'failed',
      );

      await this.persistRun(
        run,
        [
          {
            runId: run.id,
            evaluatorId: 'orchestrator',
            passed: false,
            severity: 'critical',
            message,
          },
        ],
        [],
        bundle.runDir,
        'failed',
      );

      log.error('Run fallido', { runId: run.id, error: message, attempt });

      throw err;

    } finally {

      await playwright?.close().catch(() => undefined);

    }

  }



  private buildRun(scenarioId: string, seed?: string) {

    const guardReport = runSecurityGuards(this.config);

    if (!guardReport.ok) {

      throw new Error(`Guards fallaron: ${guardReport.blockedReason}`);

    }

    assertGuardsPass(this.config);



    const scenario = loadScenario(scenarioId);

    const target = resolveTargetEnvironment(this.config.targetId);

    if (!target) {

      throw new Error(`Target no resuelto: ${this.config.targetId}`);

    }



    let status: RunStatus = 'pending';

    status = transition(status, 'preparing');

    status = transition(status, 'seeding');



    const run: EvolutionRun = {

      id: randomUUID(),

      scenarioId: scenario.id,

      scenarioVersion: scenario.version,

      targetEnvironmentId: target.id,

      personaId: `${scenario.persona.role}-${scenario.persona.experience ?? 'default'}`,

      status,

      randomSeed: seed ?? randomUUID(),

      modelName: this.config.model,

      modelProfile: 'simulated_user',

      promptVersion: 'mvp-1',

      startedAt: new Date().toISOString(),

      configuration: {

        llmConcurrency: this.config.llmConcurrency,

        browserConcurrency: this.config.browserConcurrency,

        browserEnabled: this.config.browserEnabled,
        llmSimMode: this.config.llmSimMode,

        attemptBudget: this.config.maxScenarioAttempts,

      },

    };



    return { run, guardReport, scenario };

  }

  private async persistRun(
    run: EvolutionRun,
    evaluations: EvaluationResult[],
    findings: ReturnType<typeof createFindingsFromEvaluations>,
    evidenceDir: string,
    finalStatus: RunStatus | string,
  ): Promise<void> {
    if (!this.config.databaseUrl) return;
    try {
      await persistRunBundle({
        databaseUrl: this.config.databaseUrl,
        run,
        evaluations,
        findings,
        evidenceDir,
        finalStatus,
      });
      log.info('Run persistido en epis2_evolab', { runId: run.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn('Persistencia DB omitida', { runId: run.id, error: message });
    }
  }
}


