import type { EvaluationResult, EvolutionRun, RunStatus } from '../contracts/schemas.js';
import { createLogger } from '../logger.js';
import { persistRunBundle } from '../persistence/repository.js';
import type { createFindingsFromEvaluations } from '../findings/creator.js';

const log = createLogger('persist-run');

export function orchestratorFailureEvaluation(runId: string, message: string): EvaluationResult {
  return {
    runId,
    evaluatorId: 'orchestrator',
    passed: false,
    severity: 'critical',
    message,
  };
}

/** Fase PERSIST: best-effort hacia epis2_evolab (filesystem ya escrito por el collector). */
export async function persistRun(
  databaseUrl: string | undefined,
  input: {
    run: EvolutionRun;
    evaluations: EvaluationResult[];
    findings: ReturnType<typeof createFindingsFromEvaluations>;
    evidenceDir: string;
    finalStatus: RunStatus | string;
  },
): Promise<void> {
  if (!databaseUrl) return;
  try {
    await persistRunBundle({
      databaseUrl,
      run: input.run,
      evaluations: input.evaluations,
      findings: input.findings,
      evidenceDir: input.evidenceDir,
      finalStatus: input.finalStatus,
    });
    log.info('Run persistido en epis2_evolab', { runId: input.run.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn('Persistencia DB omitida', { runId: input.run.id, error: message });
  }
}
