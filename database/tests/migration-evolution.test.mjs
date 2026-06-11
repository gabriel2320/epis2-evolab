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

  it('define scenario_fitness con cobertura, novedad y FK a runs', async () => {
    const sql = await readFile(join(migrationsDir, '003_scenario_fitness.sql'), 'utf8');
    expect(sql).toContain('evolution.scenario_fitness');
    expect(sql).toContain('endpoints_covered');
    expect(sql).toContain('audit_events_covered');
    expect(sql).toContain('novelty');
    expect(sql).toContain('REFERENCES evolution.runs');
  });

  it('bootstrap crea rol epis2_evolab', async () => {
    const sql = await readFile(join(migrationsDir, '001_bootstrap_role.sql'), 'utf8');
    expect(sql).toContain('epis2_evolab');
  });

  it('Sprint 11: judge advisory + bandit UCB', async () => {
    const sql = await readFile(join(migrationsDir, '005_judge_bandit.sql'), 'utf8');
    expect(sql).toContain('judge_verdict');
    expect(sql).toContain('model_bandit_stats');
    expect(sql).toContain('model_bandit_events');
  });
});
