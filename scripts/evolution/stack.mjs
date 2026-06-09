#!/usr/bin/env node
/**
 * Stack de laboratorio Evolab — requiere checkout EPIS2 en EPIS2_ROOT.
 */
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const isWin = process.platform === 'win32';

function run(label, cmd, args, cwd = ROOT) {
  console.log(`\n▶ ${label}`);
  const bin = isWin && cmd === 'npm' ? 'npm.cmd' : cmd;
  const result = spawnSync(bin, args, { stdio: 'inherit', cwd, shell: isWin });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const epis2Root = process.env.EPIS2_ROOT;
if (!epis2Root || !existsSync(epis2Root)) {
  console.error(
    'evolab:stack requiere EPIS2_ROOT apuntando al checkout de EPIS2 (sandbox clínico).\n' +
      '  Ejemplo: $env:EPIS2_ROOT="C:\\path\\to\\epis2"\n' +
      '  Luego en EPIS2: npm run stack:dev\n' +
      '  En este repo: npm run evolab:db:migrate && npm run evolab:doctor',
  );
  process.exit(1);
}

console.log('epis2-evolab stack — entorno de laboratorio\n');
console.log(`  EPIS2_ROOT=${epis2Root}`);
run('sandbox EPIS2', 'npm', ['run', 'stack:dev'], epis2Root);
run('evolab db migrate', 'npm', ['run', 'evolab:db:migrate']);
run('evolab doctor', 'npm', ['run', 'evolab:doctor']);
console.log('\nevolab:stack OK — sandbox clínico + DB Evolab + verificación');
console.log('  Opcional: npm run evolab:console → http://127.0.0.1:5190');
