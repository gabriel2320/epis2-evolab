import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'evolution', 'migrations');

describe('migration-evolution', () => {
  it('define schema evolution con runs, evaluations y findings', async () => {
    const sql = await readFile(join(migrationsDir, '002_schema.sql'), 'utf8');
    expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS evolution');
    expect(sql).toContain('evolution.runs');
    expect(sql).toContain('evolution.evaluations');
    expect(sql).toContain('evolution.findings');
    expect(sql).toContain('evolution.human_decisions');
    expect(sql).toContain('epis2_evolab');
  });

  it('bootstrap crea rol epis2_evolab', async () => {
    const sql = await readFile(join(migrationsDir, '001_bootstrap_role.sql'), 'utf8');
    expect(sql).toContain('epis2_evolab');
  });
});
