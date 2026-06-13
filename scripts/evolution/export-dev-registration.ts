#!/usr/bin/env node
/**
 * Regenera reports/evolution/epis2-dev-registration.jsonl
 * Uso: npm run evolab:dev-register:export [-- --out path]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { buildDevRegistrationEntries } from '../../apps/evolution-lab/src/hypotheses/dev-registration.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const defaultOut = join(
    resolve(process.cwd(), 'reports/evolution'),
    'epis2-dev-registration.jsonl',
  );
  const outPath = outIdx >= 0 ? resolve(args[outIdx + 1] ?? defaultOut) : defaultOut;

  const entries = buildDevRegistrationEntries();
  mkdirSync(dirname(outPath), { recursive: true });
  const body = entries.map((e) => JSON.stringify(e)).join('\n');
  writeFileSync(outPath, body ? `${body}\n` : '', 'utf8');

  const byKind = entries.reduce(
    (acc, e) => {
      acc[e.kind] = (acc[e.kind] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  console.log(`Registro dev: ${outPath}`);
  console.log(`  Total: ${entries.length}`);
  for (const [k, n] of Object.entries(byKind)) {
    console.log(`    ${k}: ${n}`);
  }
  console.log(
    `  Open producto: ${entries.filter((e) => e.kind === 'product-hypothesis' && e.status === 'open').length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
