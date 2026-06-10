import type { EvolabConfig } from '../config/env.js';
import { assertGuardsPass, runSecurityGuards } from '../security/guards.js';
import { resolveTargetEnvironment } from '../security/target-allowlist.js';
import { createLogger } from '../logger.js';
import { transition } from '../state-machine/transitions.js';
import type { EvaluationResult, EvolutionRun, RunStatus } from '../contracts/schemas.js';
import { loadScenario } from '../scenarios/loader.js';
import { Epis2ApiTargetAdapterImpl } from '../target/epis2-api-target-adapter.js';
import type { PlaywrightController } from '../browser/playwright-controller.js';
import { EvidenceCollector } from '../evidence/collector.js';
import { executeScenario } from '../scenarios/executor.js';
import type { ScenarioObservation } from '../evaluators/types.js';
import { isPlanDrivenScenario } from '../plan-executor/path-resolver.js';
import { resolveDemoPersona } from '../resources/demo-users.js';
import { captureAuditTrail } from './audit-capture.js';
import { buildRun } from './build-run.js';
import { evaluateRun, resolveFinalStatus } from './evaluate-run.js';
import { orchestratorFailureEvaluation, persistRun } from './persist-run.js';
import { createRunBrowser, runFixturePhase, runPlanPhase } from './run-phases.js';

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

export type ExecuteRunOptions = { resetFixtures?: boolean };

function isTransientError(message: string): boolean {
  return /no alcanzable|ECONNREFUSED|fetch failed|timeout|ETIMEDOUT|503|502|504/i.test(message);
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

  async executeRun(
    scenarioId: string,
    seed?: string,
    opts: ExecuteRunOptions = {},
  ): Promise<OrchestratorResult> {
    const scenario = loadScenario(scenarioId);
    const maxAttempts = Math.min(
      scenario.maxAttempts ?? this.config.maxScenarioAttempts,
      this.config.maxScenarioAttempts,
    );

    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.runOnce(scenarioId, seed, attempt, opts);
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
    opts: ExecuteRunOptions = {},
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
    const collector = new EvidenceCollector(this.config.reportsDir, this.config.evidenceMode);
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

      runFixturePhase(scenario, collector, bundle, opts.resetFixtures === true);

      const simulatedPlan = await runPlanPhase(this.config, scenario, collector, bundle);

      checkDeadline();
      status = transition(status, 'running');
      run.status = status;

      const creds = resolveDemoPersona(scenario.persona.role);
      const session = await api.login(creds.username, creds.demoAuthKey);

      const runBrowser = await createRunBrowser(this.config, scenario, collector, bundle, session);
      playwright = runBrowser.playwright;
      const browser = runBrowser.browser;

      checkDeadline();
      const execution = await executeScenario(
        scenario,
        {
          api,
          browser,
          apiBaseUrl: this.config.apiBaseUrl,
          webBaseUrl: this.config.webBaseUrl,
          evidence: bundle,
          writeApi: (label, payload) => collector.writeApiCapture(bundle, label, payload),
          session,
        },
        {
          ...(simulatedPlan ? { plan: simulatedPlan } : {}),
          llmSimMode: this.config.llmSimMode,
          browserEnabled: this.config.browserEnabled,
        },
      );

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

      const { evaluations, findings, passed } = evaluateRun({
        run,
        scenario,
        observations: bundle.observations as ScenarioObservation[],
      });

      const finalStatus = resolveFinalStatus({
        passed,
        requireHumanApproval: this.config.requireHumanApproval,
        scenarioRequiresHumanReview: scenario.requiresHumanReview === true,
      });
      if (finalStatus === 'completed') {
        status = transition(status, 'passed');
        status = transition(status, 'completed');
      } else {
        status = transition(status, finalStatus);
      }
      run.status = status;
      run.completedAt = new Date().toISOString();

      collector.finalize(bundle, run, evaluations, status, findings);
      await persistRun(this.config.databaseUrl, {
        run,
        evaluations,
        findings,
        evidenceDir: bundle.runDir,
        finalStatus: status,
        fitness: {
          scenario,
          observations: bundle.observations as ScenarioObservation[],
          ollamaUrl: this.config.ollamaUrl,
          ...(this.config.embeddingModel ? { embeddingModel: this.config.embeddingModel } : {}),
        },
      });

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

      const failureEval = orchestratorFailureEvaluation(run.id, message);
      collector.finalize(bundle, run, [failureEval], 'failed');
      await persistRun(this.config.databaseUrl, {
        run,
        evaluations: [failureEval],
        findings: [],
        evidenceDir: bundle.runDir,
        finalStatus: 'failed',
      });

      log.error('Run fallido', { runId: run.id, error: message, attempt });
      throw err;
    } finally {
      await playwright?.close().catch(() => undefined);
    }
  }

  private buildRun(scenarioId: string, seed?: string) {
    return buildRun(this.config, scenarioId, seed);
  }
}
