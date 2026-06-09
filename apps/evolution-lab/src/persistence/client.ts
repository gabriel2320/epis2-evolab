import postgres, { type Sql } from 'postgres';

let cached: Sql | undefined;

export function getEvolabSql(databaseUrl: string): Sql {
  if (!cached) {
    cached = postgres(databaseUrl, { max: 4, idle_timeout: 20 });
  }
  return cached;
}

export async function closeEvolabSql(): Promise<void> {
  if (cached) {
    await cached.end({ timeout: 5 });
    cached = undefined;
  }
}

export async function pingEvolabDatabase(databaseUrl: string): Promise<boolean> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await sql`SELECT 1 AS ok`;
    return true;
  } catch {
    return false;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
