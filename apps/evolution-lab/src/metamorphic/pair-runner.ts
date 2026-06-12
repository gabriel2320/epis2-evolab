import type { EvolabConfig } from '../config/env.js';
import type { MetamorphicRelation } from '../contracts/metamorphic-schema.js';
import type { EvaluationResult, Finding } from '../contracts/schemas.js';
import {
  evaluateMetamorphicRelation,
  newCorrelationId,
  type PairSide,
} from '../evaluators/metamorphic.js';
import { EvolutionOrchestrator } from '../orchestrator/orchestrator.js';
import { loadScenario } from '../scenarios/loader.js';
import {
  applyScenarioOverrides,
  loadRelation,
  validateRelationDryRun,
} from '../scenarios/relation-loader.js';

export type MetamorphicPairResult = {
  relationId: string;
  correlationId: string;
  source: PairSide;
  followUps: PairSide[];
  evaluations: EvaluationResult[];
  findings: Finding[];
  passed: boolean;
};

function extractInheritedContext(source: PairSide, keys: string[]): Record<string, unknown> {
  const inherited: Record<string, unknown> = {};
  for (const key of keys) {
    for (const obs of source.observations) {
      if (obs.payload[key] !== undefined) {
        inherited[key] = obs.payload[key];
        break;
      }
    }
  }
  return inherited;
}

function isInfraFailure(status?: string): boolean {
  return status === 'failed';
}

function toPairSide(
  runId: string,
  scenarioId: string,
  observations: PairSide['observations'],
  evidenceDir?: string,
  finalStatus?: string,
): PairSide {
  const side: PairSide = { runId, scenarioId, observations };
  if (evidenceDir !== undefined) side.evidenceDir = evidenceDir;
  if (finalStatus !== undefined) side.finalStatus = finalStatus;
  return side;
}

export async function runMetamorphicPair(
  config: EvolabConfig,
  relation: MetamorphicRelation,
  correlationId = newCorrelationId(),
): Promise<MetamorphicPairResult> {
  const dryIssues = validateRelationDryRun(relation);
  if (dryIssues.length > 0) {
    throw new Error(`Dry-run relación falló:\n  ${dryIssues.join('\n  ')}`);
  }

  const orchestrator = new EvolutionOrchestrator(config);
  const sourceScenario = applyScenarioOverrides(
    loadScenario(relation.source.scenario),
    relation.source.overrides,
  );

  const sourceResult = await orchestrator.executeScenarioDefinition(sourceScenario, undefined, {
    configuration: {
      correlationId,
      pairRole: 'source',
      relationId: relation.id,
    },
    ...(relation.source.overrides?.fixture ? { resetFixtures: true } : {}),
  });

  const source = toPairSide(
    sourceResult.run.id,
    sourceScenario.id,
    sourceResult.observations ?? [],
    sourceResult.evidenceDir,
    sourceResult.finalStatus,
  );

  const followUps: PairSide[] = [];

  if (isInfraFailure(source.finalStatus)) {
    const empty = evaluateMetamorphicRelation({
      relation,
      correlationId,
      source,
      followUps,
    });
    return {
      relationId: relation.id,
      correlationId,
      source,
      followUps,
      ...empty,
    };
  }

  const followSpec = relation.followUp;
  const repeat = followSpec?.repeat ?? (followSpec ? 1 : 0);
  const reuseKeys = followSpec?.reuseContext ?? [];

  for (let i = 0; i < repeat; i += 1) {
    if (followSpec?.resetFixturesBetween || followSpec?.overrides?.fixture) {
      // re-aplica fixture sandbox entre mitades del par (p. ej. MAR held vs scheduled)
    }

    const inheritedContext =
      reuseKeys.length > 0 ? extractInheritedContext(source, reuseKeys) : undefined;

    const followScenario = applyScenarioOverrides(
      loadScenario(followSpec!.scenario),
      followSpec!.overrides,
    );

    const followResult = await orchestrator.executeScenarioDefinition(followScenario, undefined, {
      configuration: {
        correlationId,
        pairRole: 'followUp',
        relationId: relation.id,
        pairIndex: i,
      },
      ...(inheritedContext ? { inheritedContext } : {}),
      ...(followSpec?.resetFixturesBetween || followSpec?.overrides?.fixture
        ? { resetFixtures: true }
        : {}),
    });

    followUps.push(
      toPairSide(
        followResult.run.id,
        followScenario.id,
        followResult.observations ?? [],
        followResult.evidenceDir,
        followResult.finalStatus,
      ),
    );

    if (isInfraFailure(followResult.finalStatus)) break;
  }

  const evalResult = evaluateMetamorphicRelation({
    relation,
    correlationId,
    source,
    followUps,
  });

  return {
    relationId: relation.id,
    correlationId,
    source,
    followUps,
    ...evalResult,
  };
}

export async function runMetamorphicRelationById(
  config: EvolabConfig,
  relationId: string,
): Promise<MetamorphicPairResult> {
  const relation = loadRelation(relationId);
  return runMetamorphicPair(config, relation);
}

export async function runMetamorphicBatch(
  config: EvolabConfig,
  opts: { tag?: string; all?: boolean },
): Promise<{ total: number; passed: number; failed: number; results: MetamorphicPairResult[] }> {
  const { listRelations } = await import('../scenarios/relation-loader.js');
  let all = listRelations();
  if (opts.tag) {
    const tag = opts.tag;
    all = all.filter((r) => r.tags?.includes(tag));
  }

  const results: MetamorphicPairResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const relation of all) {
    const result = await runMetamorphicPair(config, relation);
    results.push(result);
    if (result.passed) passed += 1;
    else failed += 1;
  }

  return { total: all.length, passed, failed, results };
}
