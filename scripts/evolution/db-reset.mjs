#!/usr/bin/env node
/**
 * Reset DB Evolab — trunca tablas del schema evolution (conserva schema)
 */
import postgres from 'postgres';
import { loadEnvFile } from '../load-env.mjs';
import { maskDatabaseUrl, resolveEvolabMigrateDatabaseUrl } from './db-url.mjs';

loadEnvFile();

async function main() {
  const url = resolveEvolabMigrateDatabaseUrl();
  if (!url) {
    console.error('evolab:db:reset FAILED: EPIS2_EVOLAB_DATABASE_URL no definida');
    process.exit(1);
  }

  const dbUrl = new URL(url);
  dbUrl.pathname = '/epis2_evolab';
  console.log(`evolab:db:reset — ${maskDatabaseUrl(dbUrl.toString())}`);

  const sql = postgres(dbUrl.toString(), { max: 1 });
  try {
    await sql.unsafe(`
      TRUNCATE evolution.human_decisions CASCADE;
      TRUNCATE evolution.findings CASCADE;
      TRUNCATE evolution.evaluations CASCADE;
      TRUNCATE evolution.runs CASCADE;
    `);
    console.log('evolab:db:reset OK — tablas evolution truncadas');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('evolab:db:reset FAILED:', err.message ?? err);
  process.exit(1);
});
