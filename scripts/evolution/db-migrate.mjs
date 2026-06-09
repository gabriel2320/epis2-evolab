#!/usr/bin/env node
/**
 * Migraciones epis2_evolab — bootstrap rol/DB + schema evolution
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { loadEnvFile } from '../load-env.mjs';
import {
  maskDatabaseUrl,
  resolveEvolabAdminDatabaseUrl,
  resolveEvolabMigrateDatabaseUrl,
} from './db-url.mjs';

loadEnvFile();

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');
const migrationsDir = join(root, 'database', 'evolution', 'migrations');
const EVOLAB_DB = 'epis2_evolab';

async function ensureDatabase(adminUrl) {
  const sql = postgres(adminUrl, { max: 1 });
  try {
    const exists = await sql`
      SELECT 1 FROM pg_database WHERE datname = ${EVOLAB_DB}
    `;
    if (exists.length === 0) {
      console.log(`Creando base de datos ${EVOLAB_DB}…`);
      await sql.unsafe(`CREATE DATABASE ${EVOLAB_DB} OWNER epis2_evolab`);
    } else {
      console.log(`Base de datos ${EVOLAB_DB} ya existe`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function applyMigrations(targetUrl) {
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const dbUrl = new URL(targetUrl);
  dbUrl.pathname = `/${EVOLAB_DB}`;
  const evolabUrl = dbUrl.toString();

  const sql = postgres(evolabUrl, { max: 1 });
  try {
    for (const file of files) {
      if (file === '001_bootstrap_role.sql') continue;
      const content = await readFile(join(migrationsDir, file), 'utf8');
      console.log(`Aplicando ${file}…`);
      await sql.unsafe(content);
    }
    console.log(`evolab:db:migrate OK — ${files.length - 1} migración(es) en schema evolution`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  const adminUrl = resolveEvolabAdminDatabaseUrl();
  const migrateUrl = resolveEvolabMigrateDatabaseUrl();
  if (!adminUrl || !migrateUrl) {
    console.error(
      'evolab:db:migrate FAILED: definir EPIS2_EVOLAB_DATABASE_URL o EPIS2_EVOLAB_MIGRATE_URL',
    );
    process.exit(1);
  }

  console.log(`evolab:db:migrate — admin ${maskDatabaseUrl(adminUrl)}`);

  const roleSql = await readFile(join(migrationsDir, '001_bootstrap_role.sql'), 'utf8');
  const admin = postgres(adminUrl, { max: 1 });
  try {
    console.log('Aplicando 001_bootstrap_role.sql…');
    await admin.unsafe(roleSql);
  } finally {
    await admin.end({ timeout: 5 });
  }

  await ensureDatabase(adminUrl);
  await applyMigrations(migrateUrl);
}

main().catch((err) => {
  console.error('evolab:db:migrate FAILED:', err.message ?? err);
  process.exit(1);
});
