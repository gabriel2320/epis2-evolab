#!/usr/bin/env node
/** Validación interna Evolab */
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const isWin = process.platform === 'win32';

function run(label, cmd, args) {
  console.log(`\n▶ ${label}`);
  const bin = isWin && cmd === 'npm' ? 'npm.cmd' : cmd;
  const result = spawnSync(bin, args, { stdio: 'inherit', cwd: ROOT, shell: isWin });
  if (result.status !== 0) {
    console.error(`\n✗ ${label} falló`);
    process.exit(result.status ?? 1);
  }
}

console.log('evolab:validate\n');
run('build demo-fixtures', 'npm', ['run', 'build', '-w', '@evolab/demo-fixtures']);
run('typecheck', 'npm', ['run', 'typecheck', '-w', '@evolab/evolution-lab']);
run('unit tests', 'npm', ['run', 'test', '-w', '@evolab/evolution-lab']);
run('boundary', 'node', ['scripts/evolution/boundary-validate.mjs']);
console.log('\nevolab:validate OK');
