import type { EvaluationResult, Finding } from '../contracts/schemas.js';
import { computeFindingFingerprint } from './fingerprint.js';

export function createFindingsFromEvaluations(input: {
  runId: string;
  scenarioId: string;
  targetEnvironmentId: string;
  evaluations: EvaluationResult[];
}): Finding[] {
  const findings: Finding[] = [];

  for (const ev of input.evaluations) {
    if (ev.passed) continue;

    const category = mapCategory(ev.evaluatorId);
    const severity = mapFindingSeverity(ev.severity);
    const recommendedAction =
      severity === 'critical' || severity === 'high' ? 'generate_test' : 'human_review';

    findings.push({
      runId: input.runId,
      scenarioId: input.scenarioId,
      targetEnvironmentId: input.targetEnvironmentId,
      category,
      severity,
      confidence: severity === 'critical' ? 0.95 : severity === 'high' ? 0.85 : 0.7,
      title: `${input.scenarioId} — ${ev.evaluatorId}`,
      expectedResult: `Evaluador ${ev.evaluatorId} debe pasar`,
      actualResult: ev.message,
      reproducible: true,
      evidenceIds: [],
      affectedComponents: inferComponents(ev.evaluatorId, input.scenarioId),
      fingerprint: computeFindingFingerprint({
        scenarioId: input.scenarioId,
        targetEnvironmentId: input.targetEnvironmentId,
        findingCategory: category,
        component: ev.evaluatorId,
        expectedState: 'passed',
        actualState: ev.message,
      }),
      recommendedAction,
    });
  }

  return findings;
}

function mapFindingSeverity(
  severity: EvaluationResult['severity'],
): 'low' | 'medium' | 'high' | 'critical' {
  if (severity === 'critical' || severity === 'high' || severity === 'low') return severity;
  return 'medium';
}

function mapCategory(evaluatorId: string): string {
  switch (evaluatorId) {
    case 'clinical_safety':
    case 'mar_safety':
    case 'critical_pending':
      return 'clinical_safety';
    case 'role_permission':
    case 'functional':
      return 'authorization';
    case 'audit':
      return 'audit_trail';
    case 'dom_state':
      return 'ui_consistency';
    default:
      return 'regression';
  }
}

function inferComponents(evaluatorId: string, scenarioId: string): string[] {
  const base = [`evolab:evaluator/${evaluatorId}`, `evolab:scenario/${scenarioId}`];
  if (evaluatorId === 'clinical_safety' && scenarioId.includes('discharge')) {
    return [...base, 'apps/api/clinical', 'packages/clinical-domain/cdr'];
  }
  if (evaluatorId === 'mar_safety') {
    return [...base, 'apps/api/clinical/mar', 'packages/clinical-domain/cdr'];
  }
  if (evaluatorId === 'role_permission') {
    return [...base, 'apps/api/auth'];
  }
  return base;
}
