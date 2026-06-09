import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const EvolabEnvSchema = z.object({
  enabled: z.boolean(),
  ollamaUrl: z.string().url(),
  model: z.string().min(1),
  fastModel: z.string().optional(),
  embeddingModel: z.string().optional(),
  llmConcurrency: z.number().int().min(1).max(4),
  browserConcurrency: z.number().int().min(1).max(4),
  maxScenarioAttempts: z.number().int().min(1).max(10),
  maxReproductionAttempts: z.number().int().min(0).max(10),
  maxModelErrors: z.number().int().min(1).max(10),
  patchingEnabled: z.boolean(),
  requireHumanApproval: z.boolean(),
  allowPush: z.boolean(),
  allowMerge: z.boolean(),
  targetId: z.string().min(1),
  webBaseUrl: z.string().url(),
  apiBaseUrl: z.string().url(),
  databaseUrl: z.string().optional(),
  reportsDir: z.string().min(1),
  faultInjection: z.string().optional(),
  globalTimeoutMs: z.number().int().positive(),
  browserEnabled: z.boolean(),
  ollamaRequired: z.boolean(),
  llmSimMode: z.enum(['off', 'plan', 'execute']),
});

export type EvolabConfig = z.infer<typeof EvolabEnvSchema>;

function loadDotEnv(): void {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'apps/evolution-lab/.env'),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const content = readFileSync(path, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

function envBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function envOptional(key: string): string | undefined {
  const raw = process.env[key]?.trim();
  return raw ? raw : undefined;
}

function parseLlmSimMode(): 'off' | 'plan' | 'execute' {
  const raw = process.env.EPIS2_EVOLAB_LLM_SIM?.toLowerCase()?.trim();
  if (!raw || raw === 'false' || raw === '0' || raw === 'off') return 'off';
  if (raw === 'execute' || raw === 'run') return 'execute';
  if (raw === 'true' || raw === '1' || raw === 'plan') return 'plan';
  return 'off';
}

export function loadEvolabConfig(): EvolabConfig {
  loadDotEnv();
  const config = {
    enabled: envBool('EPIS2_EVOLAB_ENABLED', false),
    ollamaUrl: process.env.EPIS2_EVOLAB_OLLAMA_URL ?? 'http://127.0.0.1:11434',
    model: process.env.EPIS2_EVOLAB_MODEL ?? 'qwen3:8b',
    fastModel: envOptional('EPIS2_EVOLAB_FAST_MODEL'),
    embeddingModel: envOptional('EPIS2_EVOLAB_EMBEDDING_MODEL'),
    llmConcurrency: envInt('EPIS2_EVOLAB_LLM_CONCURRENCY', 1),
    browserConcurrency: envInt('EPIS2_EVOLAB_BROWSER_CONCURRENCY', 1),
    maxScenarioAttempts: envInt('EPIS2_EVOLAB_MAX_SCENARIO_ATTEMPTS', 3),
    maxReproductionAttempts: envInt('EPIS2_EVOLAB_MAX_REPRODUCTION_ATTEMPTS', 2),
    maxModelErrors: envInt('EPIS2_EVOLAB_MAX_MODEL_ERRORS', 2),
    patchingEnabled: envBool('EPIS2_EVOLAB_PATCHING_ENABLED', false),
    requireHumanApproval: envBool('EPIS2_EVOLAB_REQUIRE_HUMAN_APPROVAL', true),
    allowPush: envBool('EPIS2_EVOLAB_ALLOW_PUSH', false),
    allowMerge: envBool('EPIS2_EVOLAB_ALLOW_MERGE', false),
    targetId: process.env.EPIS2_EVOLAB_TARGET_ID ?? 'epis2-local-sandbox',
    webBaseUrl: process.env.EPIS2_EVOLAB_WEB_BASE_URL ?? 'http://127.0.0.1:5173',
    apiBaseUrl: process.env.EPIS2_EVOLAB_API_BASE_URL ?? 'http://127.0.0.1:3001',
    databaseUrl: envOptional('EPIS2_EVOLAB_DATABASE_URL'),
    reportsDir: process.env.EPIS2_EVOLAB_REPORTS_DIR ?? 'reports/evolution/runs',
    faultInjection: envOptional('EPIS2_EVOLAB_FAULT_INJECTION'),
    globalTimeoutMs: envInt('EPIS2_EVOLAB_GLOBAL_TIMEOUT_MS', 600_000),
    browserEnabled: envBool('EPIS2_EVOLAB_BROWSER', false),
    ollamaRequired: envBool('EPIS2_EVOLAB_OLLAMA_REQUIRED', false),
    llmSimMode: parseLlmSimMode(),
  };
  return EvolabEnvSchema.parse(config);
}
