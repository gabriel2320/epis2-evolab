import { loadEvolabConfig } from '../config/env.js';
import {
  loadRelation,
  listRelations,
  validateRelationDryRun,
} from '../scenarios/relation-loader.js';
import {
  runMetamorphicBatch,
  runMetamorphicRelationById,
  type MetamorphicPairResult,
} from '../metamorphic/pair-runner.js';
import { preflightTarget } from './commands.js';

export type MetamorphicCommandOptions = {
  relation?: string;
  tag?: string;
  all?: boolean;
  dryRun?: boolean;
  json?: boolean;
  skipPreflight?: boolean;
};

function printMetamorphicResult(result: MetamorphicPairResult): void {
  const icon = result.passed ? '✓' : '✗';
  console.log(`${icon} ${result.relationId} (correlation=${result.correlationId})`);
  for (const ev of result.evaluations) {
    const evIcon = ev.passed ? '  ✓' : '  ✗';
    console.log(`${evIcon} ${ev.message}`);
  }
  if (result.findings.length > 0) {
    console.log(`  findings: ${result.findings.length}`);
  }
}

export async function runMetamorphic(opts: MetamorphicCommandOptions): Promise<number> {
  if (opts.dryRun) {
    const relations = opts.relation
      ? [loadRelation(opts.relation)]
      : listRelations().filter((r) => (opts.tag ? r.tags?.includes(opts.tag) : true));

    if (relations.length === 0) {
      console.error('No hay relaciones para validar');
      return 1;
    }

    let failed = 0;
    for (const relation of relations) {
      const issues = validateRelationDryRun(relation);
      if (issues.length === 0) {
        console.log(`✓ ${relation.id} — dry-run OK`);
      } else {
        failed += 1;
        console.error(`✗ ${relation.id} — dry-run falló:`);
        for (const issue of issues) {
          console.error(`    ${issue}`);
        }
      }
    }
    return failed > 0 ? 1 : 0;
  }

  const config = loadEvolabConfig();

  if (!opts.skipPreflight) {
    const preflight = await preflightTarget(config);
    if (!preflight.ok) {
      console.error('Preflight target EPIS2 FAILED:\n');
      for (const msg of preflight.messages) {
        console.error(`  ${msg}`);
      }
      console.error('\n(usar --skip-preflight para omitir esta verificación)');
      return 1;
    }
  }

  if (opts.relation) {
    const result = await runMetamorphicRelationById(config, opts.relation);
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printMetamorphicResult(result);
    }
    return result.passed ? 0 : 1;
  }

  const batch = await runMetamorphicBatch(config, {
    ...(opts.tag ? { tag: opts.tag } : {}),
    ...(opts.all ? { all: true } : {}),
  });

  if (opts.json) {
    console.log(JSON.stringify(batch, null, 2));
  } else {
    for (const result of batch.results) {
      printMetamorphicResult(result);
    }
    console.log(`\nMetamorphic: ${batch.passed}/${batch.total} passed`);
  }

  return batch.failed > 0 ? 1 : 0;
}
