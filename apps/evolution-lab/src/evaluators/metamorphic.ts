import { randomUUID } from 'node:crypto';
import type { EvaluationResult, Finding } from '../contracts/schemas.js';
import type { MetamorphicRelation, VerifyClause } from '../contracts/metamorphic-schema.js';
import type { ScenarioObservation } from './types.js';
import { classifyOutcome, resolveApiObservation } from './outcome.js';
import { computeFindingFingerprint } from '../findings/fingerprint.js';

export type PairSide = {
  runId: string;
  scenarioId: string;
  observations: ScenarioObservation[];
  evidenceDir?: string;
  finalStatus?: string;
};

export type MetamorphicEvaluatorContext = {
  relation: MetamorphicRelation;
  correlationId: string;
  source: PairSide;
  followUps: PairSide[];
};

type ObsRef = {
  run: 'source' | 'followUp';
  observation: string;
  followUpIndex?: number;
};

function resolveObservation(
  ctx: MetamorphicEvaluatorContext,
  ref: ObsRef,
): ScenarioObservation | undefined {
  const side = ref.run === 'source' ? ctx.source : ctx.followUps[ref.followUpIndex ?? 0];
  if (!side) return undefined;
  return (
    side.observations.find((o) => o.label === ref.observation) ??
    side.observations.find((o) => o.kind === 'census_snapshot' && o.label === ref.observation) ??
    resolveApiObservation(side.observations, ref.observation)
  );
}

function fieldValue(obs: ScenarioObservation | undefined, field: string): unknown {
  if (!obs) return undefined;
  return obs.payload[field];
}

function toObsRef(ref: {
  run: 'source' | 'followUp';
  observation: string;
  followUpIndex?: number | undefined;
}): ObsRef {
  const out: ObsRef = { run: ref.run, observation: ref.observation };
  if (ref.followUpIndex !== undefined) out.followUpIndex = ref.followUpIndex;
  return out;
}

function compareSnapshotEqual(
  ctx: MetamorphicEvaluatorContext,
  clause: VerifyClause,
  runId: string,
): EvaluationResult {
  const left = clause.left ? resolveObservation(ctx, toObsRef(clause.left)) : undefined;
  const right = clause.right ? resolveObservation(ctx, toObsRef(clause.right)) : undefined;
  const fields = clause.fields ?? [];
  const tolerance = clause.tolerance ?? 0;
  const mismatches: string[] = [];

  for (const field of fields) {
    const lv = fieldValue(left, field);
    const rv = fieldValue(right, field);
    if (typeof lv === 'number' && typeof rv === 'number') {
      if (Math.abs(lv - rv) > tolerance) mismatches.push(`${field}: ${lv}≠${rv}`);
    } else if (lv !== rv) {
      mismatches.push(`${field}: ${String(lv)}≠${String(rv)}`);
    }
  }

  const passed = mismatches.length === 0;
  return {
    runId,
    evaluatorId: 'metamorphic',
    passed,
    severity: passed ? 'info' : 'high',
    message: passed
      ? `snapshot_equal OK (${fields.join(', ')})`
      : `Inversión violada — ${mismatches.join('; ')}`,
    details: { clause: 'snapshot_equal', mismatches, fields },
  };
}

function compareOutcomeImplication(
  ctx: MetamorphicEvaluatorContext,
  clause: VerifyClause,
  runId: string,
): EvaluationResult {
  const premise = clause.premise;
  const conclusion = clause.conclusion;
  if (!premise || !conclusion) {
    return {
      runId,
      evaluatorId: 'metamorphic',
      passed: false,
      severity: 'medium',
      message: 'outcome_implication requiere premise y conclusion',
      details: { clause: 'outcome_implication' },
    };
  }

  const premiseObs = resolveObservation(ctx, toObsRef(premise));
  const conclusionObs = resolveObservation(ctx, toObsRef(conclusion));
  const premiseOutcome = classifyOutcome(premiseObs);
  const conclusionOutcome = classifyOutcome(conclusionObs);

  if (premiseOutcome !== premise.outcome) {
    return {
      runId,
      evaluatorId: 'metamorphic',
      passed: true,
      severity: 'info',
      message: `Premisa vacua — source no alcanzó ${premise.outcome}`,
      details: { clause: 'outcome_implication', vacuous: true, premiseOutcome },
    };
  }

  const passed = conclusionOutcome === conclusion.outcome;
  return {
    runId,
    evaluatorId: 'metamorphic',
    passed,
    severity: passed ? 'info' : 'high',
    message: passed
      ? `Monotonicidad RBAC OK (${clause.permission ?? 'permiso'})`
      : `Violación RBAC — se esperaba ${conclusion.outcome}, obtuvo ${conclusionOutcome}`,
    details: {
      clause: 'outcome_implication',
      permission: clause.permission,
      premiseOutcome,
      conclusionOutcome,
      vacuous: false,
    },
  };
}

function compareInvariantRepeat(
  ctx: MetamorphicEvaluatorContext,
  clause: VerifyClause,
  runId: string,
): EvaluationResult {
  const label = clause.observation;
  const field = clause.field ?? 'status';
  if (!label) {
    return {
      runId,
      evaluatorId: 'metamorphic',
      passed: false,
      severity: 'medium',
      message: 'invariant_repeat requiere observation',
      details: { clause: 'invariant_repeat' },
    };
  }

  const sourceObs = resolveObservation(ctx, { run: 'source', observation: label });
  const sourceVal = fieldValue(sourceObs, field);
  const sides = [
    sourceVal,
    ...ctx.followUps.map((fu) => {
      const obs =
        fu.observations.find((o) => o.label === label) ??
        resolveApiObservation(fu.observations, label);
      return fieldValue(obs, field);
    }),
  ];

  const expected = clause.equals;
  const passed =
    expected !== undefined
      ? sides.every((v) => v === expected)
      : sides.every((v) => v === sourceVal);

  return {
    runId,
    evaluatorId: 'metamorphic',
    passed,
    severity: passed ? 'info' : 'high',
    message: passed
      ? `invariant_repeat OK en ${label}.${field}`
      : `Idempotencia violada — valores: ${sides.map(String).join(' → ')}`,
    details: { clause: 'invariant_repeat', field, values: sides, expected },
  };
}

function compareAuditDelta(
  ctx: MetamorphicEvaluatorContext,
  clause: VerifyClause,
  runId: string,
): EvaluationResult {
  const correlateBy = clause.correlateBy;
  const forbidden = clause.forbidden ?? [];
  const allSides = [ctx.source, ...ctx.followUps];

  let entityId: string | undefined;
  if (correlateBy) {
    for (const side of allSides) {
      const actionObs = side.observations.find(
        (o) => o.kind === 'api_response' && typeof o.payload[correlateBy] === 'string',
      );
      if (actionObs) {
        entityId = actionObs.payload[correlateBy] as string;
        break;
      }
    }
  }

  const violations: string[] = [];
  for (const side of allSides) {
    const trail = side.observations.find((o) => o.kind === 'audit_trail');
    const events = Array.isArray(trail?.payload.events)
      ? (trail.payload.events as Array<{ eventType?: string; entityId?: string }>)
      : [];
    for (const pattern of forbidden) {
      const hit = events.some(
        (e) => e.eventType?.includes(pattern) && (!entityId || e.entityId === entityId),
      );
      if (hit) violations.push(`${pattern} en run ${side.runId}`);
    }
  }

  const passed = violations.length === 0;
  const severity =
    forbidden.includes('clinical.draft.approved') && violations.length > 0 ? 'high' : 'medium';

  return {
    runId,
    evaluatorId: 'metamorphic',
    passed,
    severity: passed ? 'info' : severity,
    message: passed
      ? 'audit_delta OK — sin eventos prohibidos'
      : `Auditoría prohibida detectada: ${violations.join(', ')}`,
    details: { clause: 'audit_delta', violations, entityId, forbidden },
  };
}

function compareDelta(
  ctx: MetamorphicEvaluatorContext,
  clause: VerifyClause,
  runId: string,
): EvaluationResult {
  const label = clause.observation;
  const field = clause.field ?? 'total';
  const expected = typeof clause.expected === 'number' ? clause.expected : 0;

  const sourceObs = label
    ? resolveObservation(ctx, { run: 'source', observation: label })
    : undefined;
  const followObs =
    ctx.followUps[0] && label
      ? resolveObservation(ctx, { run: 'followUp', observation: label, followUpIndex: 0 })
      : undefined;

  const sourceVal = Number(fieldValue(sourceObs, field) ?? 0);
  const followVal = Number(fieldValue(followObs, field) ?? 0);
  const delta = followVal - sourceVal;
  const passed = delta === expected;

  return {
    runId,
    evaluatorId: 'metamorphic',
    passed,
    severity: passed ? 'info' : 'medium',
    message: passed
      ? `delta OK (${delta} === ${expected})`
      : `delta violado — esperado ${expected}, obtuvo ${delta}`,
    details: { clause: 'delta', sourceVal, followVal, delta, expected },
  };
}

export function evaluateMetamorphicRelation(ctx: MetamorphicEvaluatorContext): {
  evaluations: EvaluationResult[];
  findings: Finding[];
  passed: boolean;
} {
  const anchorRunId = ctx.followUps[0]?.runId ?? ctx.source.runId;
  const infraFailed = [ctx.source, ...ctx.followUps].some((s) => s.finalStatus === 'failed');

  if (infraFailed) {
    const evalResult: EvaluationResult = {
      runId: anchorRunId,
      evaluatorId: 'metamorphic',
      passed: false,
      severity: 'info',
      message: 'Par no evaluable — fallo de infraestructura en algún run',
      details: { correlationId: ctx.correlationId, infraFailed: true },
    };
    return { evaluations: [evalResult], findings: [], passed: false };
  }

  const evaluations: EvaluationResult[] = [];
  for (const clause of ctx.relation.verify) {
    let result: EvaluationResult;
    switch (clause.compare) {
      case 'snapshot_equal':
        result = compareSnapshotEqual(ctx, clause, anchorRunId);
        break;
      case 'outcome_implication':
        result = compareOutcomeImplication(ctx, clause, anchorRunId);
        break;
      case 'invariant_repeat':
        result = compareInvariantRepeat(ctx, clause, anchorRunId);
        break;
      case 'audit_delta':
        result = compareAuditDelta(ctx, clause, anchorRunId);
        break;
      case 'delta':
        result = compareDelta(ctx, clause, anchorRunId);
        break;
      default:
        result = {
          runId: anchorRunId,
          evaluatorId: 'metamorphic',
          passed: false,
          severity: 'medium',
          message: `Comparador desconocido: ${clause.compare}`,
          details: { clause: clause.compare },
        };
    }
    evaluations.push(result);
  }

  const passed = evaluations.every((e) => e.passed);
  const findings: Finding[] = [];

  for (const ev of evaluations) {
    if (ev.passed) continue;
    if (ev.details?.vacuous === true) continue;

    const severity = mapMetamorphicSeverity(ev.severity, ctx.relation.onViolation.severity);
    findings.push({
      runId: anchorRunId,
      scenarioId: ctx.relation.id,
      targetEnvironmentId: 'metamorphic',
      category: ctx.relation.onViolation.category,
      severity,
      confidence: severity === 'high' ? 0.9 : 0.75,
      title: `${ctx.relation.id} — ${ev.details?.clause ?? 'metamorphic'}`,
      expectedResult: `Relación ${ctx.relation.relation} debe cumplirse`,
      actualResult: ev.message,
      reproducible: true,
      evidenceIds: [],
      affectedComponents: [
        `evolab:relation/${ctx.relation.id}`,
        `evolab:scenario/${ctx.source.scenarioId}`,
      ],
      fingerprint: computeFindingFingerprint({
        scenarioId: ctx.relation.id,
        targetEnvironmentId: 'metamorphic',
        findingCategory: ctx.relation.onViolation.category,
        component: String(ev.details?.clause ?? 'metamorphic'),
        expectedState: 'passed',
        actualState: ev.message,
      }),
      recommendedAction: 'human_review',
    });
  }

  return { evaluations, findings, passed };
}

function mapMetamorphicSeverity(
  evSeverity: EvaluationResult['severity'],
  declared: 'low' | 'medium' | 'high' | 'critical',
): 'low' | 'medium' | 'high' | 'critical' {
  if (evSeverity === 'high' || evSeverity === 'critical') return declared;
  return declared === 'critical' ? 'critical' : declared;
}

export function newCorrelationId(): string {
  return randomUUID();
}
