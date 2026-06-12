#!/usr/bin/env node
/**
 * Purga telemetría evolve local > N días (F4.3).
 * Uso: node scripts/evolution/housekeeping.mjs [--days 7] [--dry-run]
 */
import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const daysIdx = args.indexOf('--days');
const maxAgeDays = daysIdx >= 0 ? Number(args[daysIdx + 1]) : 7;

const evolveDir = join(process.cwd(), 'reports', 'evolution', 'evolve');
const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

let removed = 0;
let kept = 0;

try {
  for (const name of readdirSync(evolveDir)) {
    if (!name.endsWith('.json')) continue;
    const path = join(evolveDir, name);
    const mtime = statSync(path).mtimeMs;
    if (mtime < cutoffMs) {
      if (!dryRun) unlinkSync(path);
      removed += 1;
      console.log(`${dryRun ? '[dry-run] ' : ''}remove ${name}`);
    } else {
      kept += 1;
    }
  }
} catch (err) {
  if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
    console.log('Sin directorio reports/evolution/evolve — nada que purgar');
    process.exit(0);
  }
  throw err;
}

console.log(
  `Housekeeping evolve: ${removed} purgados, ${kept} conservados (>${maxAgeDays} días${dryRun ? ', dry-run' : ''})`,
);
