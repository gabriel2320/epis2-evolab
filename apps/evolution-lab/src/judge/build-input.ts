import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { JudgeTriageInput } from './schemas.js';
import { loadScenario } from '../scenarios/loader.js';
import {
  getFindingDetailFromDb,
  listFingerprintHistoryFromDb,
  listRunEvaluationsFromDb,
} from '../persistence/judge-repository.js';

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function readObservationsSummary(reportsDir: string, runId: string): string {
  const resultPath = resolve(process.cwd(), reportsDir, runId, 'result.json');
  if (!existsSync(resultPath)) return '';
  try {
    const result = JSON.parse(readFileSync(resultPath, 'utf8')) as {
      observations?: Array<{ label?: string; message?: string; detail?: string }>;
    };
    const lines = (result.observations ?? []).map((o) => {
      const label = o.label ?? 'obs';
      const msg = o.message ?? o.detail ?? '';
      return `${label}: ${msg}`;
    });
    return truncate(lines.join('\n'), 2000);
  } catch {
    return '';
  }
}

function readApiCaptures(reportsDir: string, runId: string) {
  const apiDir = resolve(process.cwd(), reportsDir, runId, 'api');
  if (!existsSync(apiDir)) return [];
  const captures: JudgeTriageInput['evidence']['apiCaptures'] = [];
  for (const file of readdirSync(apiDir).slice(0, 8)) {
    if (!file.endsWith('.json')) continue;
    const label = file.replace(/\.json$/, '');
    try {
      const raw = readFileSync(join(apiDir, file), 'utf8');
      const parsed = JSON.parse(raw) as { status?: number; statusCode?: number };
      const status = parsed.status ?? parsed.statusCode;
      captures.push({ label, status, excerpt: truncate(raw, 500) });
    } catch {
      captures.push({ label, excerpt: '(parse error)' });
    }
  }
  return captures;
}

export async function buildJudgeInputFromDb(opts: {
  databaseUrl: string;
  findingId: string;
  reportsDir: string;
}): Promise<JudgeTriageInput | null> {
  const finding = await getFindingDetailFromDb(opts.databaseUrl, opts.findingId);
  if (!finding) return null;

  let scenarioMeta: JudgeTriageInput['scenario'];
  try {
    const scenario = loadScenario(finding.scenarioId);
    scenarioMeta = {
      id: scenario.id,
      name: scenario.name,
      risk: scenario.risk,
      personaRole: scenario.persona.role,
      goalAction: scenario.goal.action,
      evaluators: scenario.evaluators,
      tags: scenario.tags,
    };
  } catch {
    scenarioMeta = {
      id: finding.scenarioId,
      name: finding.scenarioId,
      risk: 'unknown',
      personaRole: 'unknown',
      goalAction: 'unknown',
      evaluators: [],
    };
  }

  const evaluations = await listRunEvaluationsFromDb(opts.databaseUrl, finding.runId);
  const fingerprintHistory = await listFingerprintHistoryFromDb(
    opts.databaseUrl,
    finding.fingerprint,
    finding.id,
  );

  const runEvidenceDir = join(opts.reportsDir, finding.runId);

  return {
    finding: {
      id: finding.id,
      runId: finding.runId,
      scenarioId: finding.scenarioId,
      targetEnvironmentId: finding.targetEnvironmentId,
      category: finding.category,
      severity: finding.severity,
      confidence: finding.confidence,
      title: finding.title,
      expectedResult: finding.expectedResult,
      actualResult: finding.actualResult,
      fingerprint: finding.fingerprint,
      recommendedAction: finding.recommendedAction,
      affectedComponents: finding.affectedComponents,
      reviewStatus: finding.reviewStatus,
    },
    scenario: scenarioMeta,
    evidence: {
      runEvidenceDir,
      evaluations,
      observationsSummary: readObservationsSummary(opts.reportsDir, finding.runId),
      apiCaptures: readApiCaptures(opts.reportsDir, finding.runId),
    },
    fingerprintHistory,
  };
}

/** Construye input offline desde golden fixture (sin DB). */
export function buildJudgeInputFromGolden(entry: {
  sourceRunId: string;
  findingSnapshot: Record<string, unknown>;
  scenario?: JudgeTriageInput['scenario'];
  evaluations?: JudgeTriageInput['evidence']['evaluations'];
  fingerprintHistory?: JudgeTriageInput['fingerprintHistory'];
  reportsDir?: string;
}): JudgeTriageInput {
  const snap = entry.findingSnapshot;
  const severity = String(snap.severity ?? 'medium') as JudgeTriageInput['finding']['severity'];
  const runId = String(snap.runId ?? entry.sourceRunId);
  const reportsDir = entry.reportsDir ?? 'reports/evolution/runs';

  return {
    finding: {
      id: String(snap.id ?? ''),
      runId,
      scenarioId: String(snap.scenarioId ?? 'unknown'),
      targetEnvironmentId: String(snap.targetEnvironmentId ?? 'epis2-local-sandbox'),
      category: String(snap.category ?? 'unknown'),
      severity,
      confidence: Number(snap.confidence ?? 0.8),
      title: String(snap.title ?? ''),
      expectedResult: String(snap.expectedResult ?? snap.expected_result ?? ''),
      actualResult: String(snap.actualResult ?? snap.actual_result ?? ''),
      fingerprint: String(snap.fingerprint ?? ''),
      recommendedAction: String(snap.recommendedAction ?? snap.recommended_action ?? ''),
      affectedComponents: (snap.affectedComponents ?? snap.affected_components ?? []) as string[],
      reviewStatus: (snap.reviewStatus ?? snap.review_status ?? 'open') as
        | 'open'
        | 'approved'
        | 'rejected'
        | 'duplicate',
    },
    scenario: entry.scenario ?? {
      id: String(snap.scenarioId ?? 'unknown'),
      name: String(snap.scenarioId ?? 'unknown'),
      risk: 'high',
      personaRole: 'physician',
      goalAction: 'unknown',
      evaluators: [],
    },
    evidence: {
      runEvidenceDir: join(reportsDir, runId),
      evaluations: entry.evaluations ?? [],
      observationsSummary: readObservationsSummary(reportsDir, runId),
      apiCaptures: readApiCaptures(reportsDir, runId),
    },
    fingerprintHistory: entry.fingerprintHistory ?? [],
  };
}
