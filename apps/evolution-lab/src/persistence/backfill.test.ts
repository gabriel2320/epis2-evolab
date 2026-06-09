import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRunBundleFromDir } from './backfill.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../../test-fixtures/sample-run');

describe('backfill', () => {
  it('parsea bundle desde directorio de evidencia', () => {
    const bundle = parseRunBundleFromDir(FIXTURES);
    expect(bundle).not.toBeNull();
    expect(bundle!.run.scenarioId).toBe('discharge-critical-pending-001');
    expect(bundle!.finalStatus).toBe('human_review');
    expect(bundle!.evaluations.length).toBeGreaterThan(0);
    expect(bundle!.findings.some((f) => f.severity === 'critical')).toBe(true);
  });

  it('retorna null si falta metadata o result', () => {
    expect(parseRunBundleFromDir(process.cwd())).toBeNull();
  });
});
