import { loadEvolabConfig } from '../config/env.js';
import { evaluateResourceHealth } from '../evolution/f5-resources.js';
import { getGpuStatus } from '../gpu/orchestrator.js';
import { describeRunProfile } from '../gpu/run-profile.js';

export async function runGpuStatus(opts: { json?: boolean } = {}): Promise<number> {
  const config = loadEvolabConfig();
  const status = await getGpuStatus({ baseUrl: config.ollamaUrl });

  if (opts.json) {
    console.log(JSON.stringify(status, null, 2));
    return 0;
  }

  const health = evaluateResourceHealth(status.resources);
  console.log('EPIS2 Evolab — GPU / VRAM (S13)\n');
  console.log(`  Perfil:        ${status.profile} — ${describeRunProfile(status.profile)}`);
  console.log(`  Browser:       ${config.browserEnabled ? 'on' : 'off'}`);
  console.log(`  Modelo activo: ${status.activeModel ?? '—'}`);
  console.log(
    `  VRAM:          ${status.resources.gpu ? `${status.resources.gpu.usedPercent.toFixed(1)}%` : 'n/d'}`,
  );
  console.log(
    `  RAM sistema:   ${status.resources.system.usedPercent.toFixed(1)}% · libre ${status.resources.system.freeMemMb.toFixed(0)} MB`,
  );
  console.log(
    `  RSS evolab:    ${status.resources.evolabRssMb.toFixed(0)} MB · ollama ${status.resources.ollamaRssMb.toFixed(0)} MB`,
  );
  console.log(`  Salud:         ${health.level.toUpperCase()}${health.reasons.length ? ` — ${health.reasons.join('; ')}` : ''}`);

  if (status.loadedModels.length > 0) {
    console.log('\n  Modelos Ollama cargados:');
    for (const m of status.loadedModels) {
      console.log(`    · ${m.name} (${m.sizeMb.toFixed(0)} MB VRAM)`);
    }
  } else {
    console.log('\n  Modelos Ollama cargados: ninguno');
  }

  console.log('\n  Perfiles: EPIS2_EVOLAB_RUN_PROFILE=api-only|hybrid|visual-smoke');
  return 0;
}
