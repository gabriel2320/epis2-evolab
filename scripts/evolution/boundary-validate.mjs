#!/usr/bin/env node
/**
 * Validador de frontera Evolab ↔ EPIS2 (repo standalone).
 * Evolab no importa código clínico interno; EPIS2 (opcional) no importa Evolab.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const EVOLAB_APPS = ['apps/evolution-lab', 'apps/evolution-console'];
const FORBIDDEN_EVOLAB_IMPORTS = [
  'apps/api/src',
  'apps/web/src',
  '@epis2/api',
  '@epis2/web',
];
const FORBIDDEN_CLINICAL_IMPORTS = ['@evolab/evolution-lab', '@evolab/evolution-console', 'evolution-lab', 'evolution-console'];

function walkFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkFiles(full, acc);
    } else if (/\.(ts|tsx|mjs|js)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function scanImportsAbs(absBase, forbidden, rootLabel = absBase) {
  const violations = [];
  for (const file of walkFiles(absBase)) {
    const content = readFileSync(file, 'utf8');
    const rel = relative(rootLabel, file);
    for (const pattern of forbidden) {
      if (
        content.includes(`from '${pattern}`) ||
        content.includes(`from "${pattern}`) ||
        content.includes(`import('${pattern}`) ||
        content.includes(`import("${pattern}`)
      ) {
        violations.push(`${rel} → import prohibido: ${pattern}`);
      }
    }
  }
  return violations;
}

function scanImports(baseDir, forbidden) {
  return scanImportsAbs(join(ROOT, baseDir), forbidden, ROOT);
}

function scanEpis2Root(epis2Root) {
  const violations = [];
  for (const app of ['apps/web', 'apps/api']) {
    const abs = join(epis2Root, app);
    if (!existsSync(abs)) continue;
    violations.push(...scanImportsAbs(abs, FORBIDDEN_CLINICAL_IMPORTS, epis2Root));
  }
  return violations;
}

function main() {
  console.log('evolab:boundary:validate\n');
  const violations = [];

  for (const app of EVOLAB_APPS) {
    violations.push(...scanImports(app, FORBIDDEN_EVOLAB_IMPORTS));
    if (!existsSync(join(ROOT, app))) {
      violations.push(`${app} no existe`);
    }
  }

  const epis2Root = process.env.EPIS2_ROOT;
  if (epis2Root && existsSync(epis2Root)) {
    violations.push(...scanEpis2Root(epis2Root));
  } else {
    console.log('  ℹ EPIS2_ROOT no definido — omitiendo scan de apps clínicas EPIS2');
  }

  if (violations.length > 0) {
    console.error('Violaciones de frontera:\n');
    for (const v of violations) {
      console.error(`  ✗ ${v}`);
    }
    console.error(`\nevolab:boundary:validate FAILED (${violations.length})`);
    return 1;
  }

  console.log('  ✓ evolution-lab sin imports clínicos internos');
  console.log('  ✓ evolution-console sin imports clínicos internos');
  if (epis2Root) {
    console.log('  ✓ EPIS2 (EPIS2_ROOT) sin imports Evolab');
  }
  console.log('\nevolab:boundary:validate OK');
  return 0;
}

process.exit(main());
