import type { EvolabConfig } from '../config/env.js';
import type { EvolveOptions } from '../evolution/evolve.js';
import { listScenarios } from '../scenarios/loader.js';
import { emptyNiches, nicheKey, assignNiche, enumerateNiches } from '../evolution/niches.js';
import { getGpuStatus } from '../gpu/orchestrator.js';
import { resolveResourceLimitsForProfile } from '../evolution/f5-resources.js';
import {
  ledgerSummary,
  loadFingerprintLedger,
} from '../findings/fingerprint-ledger.js';
import { createArchiveStoreForEvolve } from '../evolution/evolve.js';
import { PRE_EVOLVE_BASE_SCENARIO_IDS } from '../evolution/pre-evolve-gate.js';
import { readHypotheses } from '../hypotheses/registry.js';
import { buildDevPlanActionItems } from '../hypotheses/dev-plan.js';
import { DEV_PLAN_FOCUS_NICHE_KEYS } from '../gpu/vram-governor.js';

export async function printEvolveDryRunPreflight(
  config: EvolabConfig,
  opts: EvolveOptions & { population?: number },
): Promise<void> {
  const population = opts.population ?? 3;
  const corpus = listScenarios().filter((s) => (s.flow ?? []).length > 0);
  const store = createArchiveStoreForEvolve(config, true);
  const elites = await store.listElites();
  const occupied = new Set(elites.map((e) => e.nicheKey));
  for (const s of corpus) occupied.add(nicheKey(assignNiche(s)));
  let empty = emptyNiches(corpus, occupied);
  if (opts.focusNicheKeys?.length) {
    const focus = new Set(opts.focusNicheKeys);
    empty = empty.filter((n) => focus.has(nicheKey(n)));
  }

  const ledger = await loadFingerprintLedger(config.databaseUrl);
  const ledgerStats = ledgerSummary(ledger);

  let gpuLine = 'VRAM: n/d (Ollama no consultado)';
  const limits = resolveResourceLimitsForProfile(config.runProfile);
  try {
    const gpu = await getGpuStatus({ baseUrl: config.ollamaUrl });
    gpuLine =
      `VRAM ${gpu.resources.gpu?.usedPercent.toFixed(1) ?? 'n/d'}%` +
      ` (max ${limits.maxGpuMemPercent}%` +
      (limits.maxGpuMemMb ? ` / ${limits.maxGpuMemMb} MB` : '') +
      `) · perfil ${gpu.profile}`;
  } catch {
    /* optional */
  }

  const estMinPerEval = config.browserEnabled ? 4.5 : 2.5;
  const estSandboxMin = opts.generations * population * estMinPerEval;
  const estMutateMin = opts.generations * 1.2;

  console.log('EPIS2 Evolab — evolve dry-run (S14.6 pre-vuelo)\n');
  console.log(`  Perfil:           ${config.runProfile} · browser ${config.browserEnabled ? 'on' : 'off'}`);
  console.log(`  Generaciones:     ${opts.generations} · población ${population}`);
  console.log(`  Presupuesto:      ${opts.budgetMinutes} min`);
  if (opts.checkpointMinutes) {
    console.log(
      `  Checkpoint:       cada ${opts.checkpointMinutes} min · mín ${opts.checkpointMinElites ?? 2} élites vacíos`,
    );
  }
  if (opts.focusNicheKeys?.length) {
    console.log(`  Focus niches:     ${opts.focusNicheKeys.join(', ')}`);
  }
  console.log(`  Nichos vacíos:    ${empty.length}/${enumerateNiches().length}`);
  console.log(
    `  Ledger signal:    ${ledgerStats.openSignalFindings} open · ${ledgerStats.structuralClusters} clusters estructurales`,
  );
  console.log(`  ${gpuLine}`);
  console.log(
    `  Estimación:       ~${(estMutateMin + estSandboxMin).toFixed(0)} min ` +
      `(mutación ~${estMutateMin.toFixed(0)} + sandbox ~${estSandboxMin.toFixed(0)} API-first)`,
  );
  if (estMutateMin + estSandboxMin > opts.budgetMinutes) {
    console.log('  ⚠ Estimación supera presupuesto — reducir gen/pop o usar --focus-niches');
  }
  console.log('\n  Muestra nichos vacíos (focus):');
  for (const n of empty.slice(0, 6)) {
    console.log(`    · ${nicheKey(n)}`);
  }
  if (empty.length > 6) console.log(`    … y ${empty.length - 6} más`);

  const openHypotheses = readHypotheses().filter((h) => h.status === 'open');
  const p0 = openHypotheses.filter((h) => h.priority === 'P0');
  const devPlanItems = buildDevPlanActionItems(readHypotheses());
  console.log('\n  S16 organic loop:');
  console.log(`    Hipótesis open: ${openHypotheses.length} (${p0.length} P0)`);
  console.log(`    Dev-plan accionables: ${devPlanItems.length}`);
  if (config.runProfile === 'dev-plan') {
    console.log(`    Focus niches dev-plan: ${DEV_PLAN_FOCUS_NICHE_KEYS.join(', ')}`);
  }
  console.log(`    Pre-evolve smoke: ${PRE_EVOLVE_BASE_SCENARIO_IDS.join(', ')}`);
  console.log('    Gate promote: --hypothesis-id | --fingerprint | --signoff');
  console.log('');
}
