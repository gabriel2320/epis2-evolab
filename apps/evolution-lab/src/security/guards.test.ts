import { describe, expect, it } from 'vitest';
import { loadEvolabConfig } from '../config/env.js';
import { runSecurityGuards } from './guards.js';

describe('security guards', () => {
  it('falla si Evolab no está habilitado', () => {
    const config = loadEvolabConfig();
    const report = runSecurityGuards({ ...config, enabled: false });
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.id === 'evolab_enabled')?.passed).toBe(false);
  });

  it('pasa con configuración sandbox válida', () => {
    const config = loadEvolabConfig();
    const report = runSecurityGuards({
      ...config,
      enabled: true,
      targetId: 'epis2-local-sandbox',
      webBaseUrl: 'http://127.0.0.1:5173',
      apiBaseUrl: 'http://127.0.0.1:3001',
      allowPush: false,
      allowMerge: false,
      patchingEnabled: false,
    });
    expect(report.ok).toBe(true);
  });

  it('rechaza target desconocido', () => {
    const config = loadEvolabConfig();
    const report = runSecurityGuards({
      ...config,
      enabled: true,
      targetId: 'production-real',
    });
    expect(report.ok).toBe(false);
  });

  it('rechaza allowPush', () => {
    const config = loadEvolabConfig();
    const report = runSecurityGuards({
      ...config,
      enabled: true,
      targetId: 'epis2-local-sandbox',
      allowPush: true,
    });
    expect(report.ok).toBe(false);
  });
});
