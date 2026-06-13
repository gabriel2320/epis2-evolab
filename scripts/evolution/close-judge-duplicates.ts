#!/usr/bin/env node
/**
 * Cierra findings open que el judge marcó como duplicate (confirmación humana batch).
 * Uso: npm run evolab:review:close-duplicates [-- --dry-run]
 */
import { loadEvolabConfig } from '../../apps/evolution-lab/src/config/env.js';
import { pingEvolabDatabase, getEvolabSql } from '../../apps/evolution-lab/src/persistence/client.js';
import { reviewFinding } from '../../apps/evolution-lab/src/persistence/repository.js';

const dryRun = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  const config = loadEvolabConfig();
  if (!config.databaseUrl || !(await pingEvolabDatabase(config.databaseUrl))) {
    console.error('requiere EPIS2_EVOLAB_DATABASE_URL');
    process.exit(1);
  }

  const sql = getEvolabSql(config.databaseUrl);
  const rows = await sql<{ id: string; scenario_id: string; fingerprint: string }[]>`
    SELECT id, scenario_id, fingerprint
    FROM evolution.findings
    WHERE review_status = 'open' AND judge_verdict = 'duplicate'
    ORDER BY judge_priority ASC NULLS LAST, created_at ASC
  `;

  if (rows.length === 0) {
    console.log('Sin duplicates judge pendientes de cierre.');
    return;
  }

  console.log(`Cierre duplicate (judge): ${rows.length} hallazgos${dryRun ? ' [dry-run]' : ''}\n`);

  let closed = 0;
  let failed = 0;
  for (const row of rows) {
    if (dryRun) {
      console.log(`  [dry-run] ${row.id.slice(0, 8)}… ${row.scenario_id} fp=${row.fingerprint.slice(0, 12)}`);
      closed += 1;
      continue;
    }
    const result = await reviewFinding(config.databaseUrl, {
      findingId: row.id,
      decision: 'duplicate',
      actor: 'evolab:review:close-duplicates',
      comment: 'Cierre batch — judge_verdict=duplicate confirmado',
    });
    if (result.ok) {
      console.log(`  ✓ ${row.id.slice(0, 8)}… ${row.scenario_id}`);
      closed += 1;
    } else {
      console.error(`  ✗ ${row.id}: ${result.message}`);
      failed += 1;
    }
  }

  console.log(`\nCerrados: ${closed}${failed > 0 ? ` · fallos: ${failed}` : ''}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
