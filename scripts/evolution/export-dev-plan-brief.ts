#!/usr/bin/env node
/**
 * Exporta brief accionable Evolab → plan de desarrollo EPIS2.
 * Uso: npm run evolab:dev-plan:brief [-- --out reports/evolution/...]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readHypotheses } from '../../apps/evolution-lab/src/hypotheses/registry.js';
import {
  buildDevPlanActionItems,
  formatDevPlanBriefMarkdown,
} from '../../apps/evolution-lab/src/hypotheses/dev-plan.js';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const stamp = new Date().toISOString().slice(0, 10);
const defaultOut = join(
  resolve(process.cwd(), 'reports/evolution'),
  `evolab-dev-plan-brief-${stamp}.md`,
);
const outPath = outIdx >= 0 ? resolve(args[outIdx + 1] ?? defaultOut) : defaultOut;
const runId = args.includes('--run-id')
  ? args[args.indexOf('--run-id') + 1]
  : undefined;
const telemetry = args.includes('--telemetry')
  ? args[args.indexOf('--telemetry') + 1]
  : undefined;

const items = buildDevPlanActionItems(readHypotheses());
const markdown = formatDevPlanBriefMarkdown(items, {
  ...(runId ? { runId } : {}),
  ...(telemetry ? { evolveTelemetry: telemetry } : {}),
});

mkdirSync(resolve(outPath, '..'), { recursive: true });
writeFileSync(outPath, markdown, 'utf8');
console.log(`Brief dev-plan: ${outPath}`);
console.log(`  Hipótesis accionables: ${items.length}`);
