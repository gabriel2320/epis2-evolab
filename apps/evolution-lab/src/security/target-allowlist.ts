import type { TargetEnvironment } from '../contracts/schemas.js';

export const TARGET_ALLOWLIST: readonly TargetEnvironment[] = [
  {
    id: 'epis2-local-sandbox',
    name: 'EPIS2 Local Sandbox',
    webBaseUrl: 'http://127.0.0.1:5173',
    apiBaseUrl: 'http://127.0.0.1:3001',
    databaseMode: 'sandbox-read-write',
    environmentType: 'local-sandbox',
    syntheticOnly: true,
    allowFaultInjection: true,
    allowDatabaseSeeding: true,
  },
  {
    id: 'epis2-ci-sandbox',
    name: 'EPIS2 CI Sandbox',
    webBaseUrl: process.env.PLAYWRIGHT_WEB_URL ?? 'http://127.0.0.1:5173',
    apiBaseUrl: process.env.PLAYWRIGHT_API_HEALTH_URL?.replace(/\/health$/, '') ??
      'http://127.0.0.1:3001',
    databaseMode: 'read-only',
    environmentType: 'ci-sandbox',
    syntheticOnly: true,
    allowFaultInjection: false,
    allowDatabaseSeeding: false,
  },
];

const PRODUCTION_HOST_PATTERNS = [
  /epis2\.(cl|hospital|prod)/i,
  /\.production\./i,
  /staging\.(?!sandbox)/i,
];

export function resolveTargetEnvironment(targetId: string): TargetEnvironment | undefined {
  return TARGET_ALLOWLIST.find((t) => t.id === targetId);
}

export function isProductionUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return false;
    }
    return PRODUCTION_HOST_PATTERNS.some((re) => re.test(parsed.hostname));
  } catch {
    return true;
  }
}
