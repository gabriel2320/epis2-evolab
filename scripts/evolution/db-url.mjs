/**
 * URLs Postgres Evolab — migraciones con superuser epis2.
 */

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | undefined}
 */
export function resolveEvolabMigrateDatabaseUrl(env = process.env) {
  if (env.EPIS2_EVOLAB_MIGRATE_URL) {
    return env.EPIS2_EVOLAB_MIGRATE_URL;
  }
  const url = env.EPIS2_EVOLAB_DATABASE_URL;
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.username === 'epis2_evolab') {
      parsed.username = 'epis2';
      parsed.password = 'epis2';
    }
    return parsed.toString();
  } catch {
    if (url.includes('epis2_evolab@')) {
      return url.replace('epis2_evolab:epis2_evolab@', 'epis2:epis2@');
    }
    return url;
  }
}

/**
 * URL admin contra DB postgres (crear epis2_evolab).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | undefined}
 */
export function resolveEvolabAdminDatabaseUrl(env = process.env) {
  const migrate = resolveEvolabMigrateDatabaseUrl(env);
  if (!migrate) return undefined;
  try {
    const parsed = new URL(migrate);
    parsed.pathname = '/postgres';
    return parsed.toString();
  } catch {
    return migrate.replace(/\/[^/]+$/, '/postgres');
  }
}

/**
 * @param {string} url
 */
export function maskDatabaseUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return url.replace(/:([^:@/]+)@/, ':***@');
  }
}
