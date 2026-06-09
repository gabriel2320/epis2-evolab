import { loadEvolabConfig } from '../../evolution-lab/src/config/env.js';

export function loadConsoleConfig() {
  const evolab = loadEvolabConfig();
  const port = Number.parseInt(process.env.EPIS2_EVOLAB_CONSOLE_PORT ?? '5190', 10);
  return {
    port: Number.isFinite(port) ? port : 5190,
    host: process.env.EPIS2_EVOLAB_CONSOLE_HOST ?? '127.0.0.1',
    databaseUrl: evolab.databaseUrl,
  };
}
