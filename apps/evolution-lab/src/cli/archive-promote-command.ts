import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEvolabConfig } from '../config/env.js';
import { pingEvolabDatabase } from '../persistence/client.js';
import { createPostgresArchiveStore } from '../evolution/archive-repository.js';
import { listScenarios, scenariosDirectory } from '../scenarios/loader.js';
import type { ArchiveEntry } from '../evolution/archive.js';
import {
  findHypothesisByFingerprint,
  findHypothesisById,
  hypothesisAllowsPromote,
  type HypothesisRecord,
} from '../hypotheses/registry.js';

export type ArchivePromoteGateResult =
  | { ok: true; reason: string; hypothesis?: HypothesisRecord }
  | { ok: false; reason: string };

/** S16.5 — validación promote (testeable sin DB). */
export function validateArchivePromoteGate(opts: {
  dryRun?: boolean;
  signoff?: string;
  hypothesisId?: string;
  fingerprint?: string;
}): ArchivePromoteGateResult {
  if (opts.dryRun) {
    return { ok: true, reason: 'dry-run (gate omitido)' };
  }
  if (opts.signoff?.trim()) {
    return { ok: true, reason: `signoff humano — "${opts.signoff.trim()}"` };
  }
  const hypothesis = opts.hypothesisId
    ? findHypothesisById(opts.hypothesisId)
    : opts.fingerprint
      ? findHypothesisByFingerprint(opts.fingerprint)
      : undefined;
  if (!hypothesis) {
    return {
      ok: false,
      reason: 'requiere --hypothesis-id, --fingerprint o --signoff',
    };
  }
  const gate = hypothesisAllowsPromote(hypothesis);
  if (!gate.ok) return { ok: false, reason: gate.reason };
  return { ok: true, reason: gate.reason, hypothesis };
}

export type ArchivePromoteOptions = {
  candidateIds?: string[];
  top?: number;
  dryRun?: boolean;
  force?: boolean;
  /** S16.5 — bypass explícito sin hipótesis vinculada */
  signoff?: string;
  hypothesisId?: string;
  fingerprint?: string;
};

function corpusIds(): Set<string> {
  return new Set(listScenarios().map((s) => s.id));
}

async function resolveEntries(
  store: ReturnType<typeof createPostgresArchiveStore>,
  opts: ArchivePromoteOptions,
): Promise<ArchiveEntry[]> {
  const elites = await store.listElites();
  const sorted = [...elites].sort((a, b) => b.fitness.score - a.fitness.score);

  if (opts.candidateIds && opts.candidateIds.length > 0) {
    const wanted = new Set(opts.candidateIds);
    const found = sorted.filter((e) => wanted.has(e.candidateId));
    const missing = opts.candidateIds.filter((id) => !found.some((e) => e.candidateId === id));
    if (missing.length > 0) {
      throw new Error(`Candidatos no encontrados en archivo: ${missing.join(', ')}`);
    }
    return found;
  }

  const limit = opts.top ?? 3;
  return sorted.slice(0, limit);
}

/**
 * Promueve élites del archivo MAP-Elites al corpus humano (`scenarios/`).
 * Actualiza status → `promoted` (intocable por evolve).
 */
export async function runArchivePromote(opts: ArchivePromoteOptions): Promise<number> {
  const config = loadEvolabConfig();
  if (!config.databaseUrl || !(await pingEvolabDatabase(config.databaseUrl))) {
    console.error('Requiere DB epis2_evolab (npm run evolab:db:migrate)');
    return 1;
  }

  const store = createPostgresArchiveStore(config.databaseUrl);
  let entries: ArchiveEntry[];
  try {
    entries = await resolveEntries(store, opts);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  if (entries.length === 0) {
    console.error('Sin élites para promover');
    return 1;
  }

  if (!opts.dryRun && !opts.signoff?.trim()) {
    const gate = validateArchivePromoteGate(opts);
    if (!gate.ok) {
      console.error(`Promoción bloqueada: ${gate.reason}`);
      console.error(
        '  evolab hypothesis list · evolab hypothesis trace --fingerprint <fp> · --signoff "motivo"',
      );
      return 1;
    }
    console.log(`Gate S16.5: ${gate.reason}\n`);
  } else if (opts.signoff?.trim()) {
    console.log(`Gate S16.5: signoff humano — "${opts.signoff.trim()}"\n`);
  }

  const existing = corpusIds();
  const scenariosDir = scenariosDirectory();
  const promoted: string[] = [];
  const skipped: string[] = [];

  console.log('EPIS2 Evolab — archive promote\n');

  for (const entry of entries) {
    const dest = join(scenariosDir, `${entry.candidateId}.yaml`);
    if (existing.has(entry.candidateId) && !opts.force) {
      skipped.push(entry.candidateId);
      console.log(`  ⊘ ${entry.candidateId} — ya en corpus (usar --force para sobrescribir)`);
      continue;
    }

    if (opts.dryRun) {
      console.log(
        `  [dry-run] ${entry.candidateId} → scenarios/ (score=${entry.fitness.score.toFixed(2)}, niche=${entry.nicheKey})`,
      );
      promoted.push(entry.candidateId);
      continue;
    }

    writeFileSync(dest, entry.scenarioYaml, 'utf8');
    await store.updateStatus(entry.candidateId, 'promoted', 'human_corpus_promote');
    promoted.push(entry.candidateId);
    console.log(
      `  ✓ ${entry.candidateId} → scenarios/ (score=${entry.fitness.score.toFixed(2)}, niche=${entry.nicheKey})`,
    );
  }

  console.log(
    `\nPromovidos: ${promoted.length}${skipped.length > 0 ? ` · omitidos: ${skipped.length}` : ''}${opts.dryRun ? ' (dry-run)' : ''}`,
  );

  if (promoted.length === 0) return 1;
  return 0;
}
