import { describe, expect, it } from 'vitest';
import { loadScenario } from '../scenarios/loader.js';
import { assignNiche } from '../evolution/niches.js';
import { buildEliteFewShotBlock, eliteScenariosForNiche } from './elite-examples.js';

describe('elite-examples', () => {
  it('devuelve escenarios para nicho con entrada en manifest', () => {
    const parent = loadScenario('role-nurse-approve-001');
    const elites = eliteScenariosForNiche(assignNiche(parent));
    expect(elites.length).toBeGreaterThan(0);
    expect(elites.length).toBeLessThanOrEqual(2);
    expect(elites[0]!.id).toBe('role-nurse-approve-001');
  });

  it('buildEliteFewShotBlock incluye YAML de élite', () => {
    const parent = loadScenario('role-nurse-approve-001');
    const block = buildEliteFewShotBlock(parent);
    expect(block).toContain('EJEMPLOS ÉLITE');
    expect(block).toContain('role-nurse-approve-001');
  });

  it('nicho sin entrada devuelve bloque vacío', () => {
    const parent = loadScenario('admission-double-booking-001');
    expect(buildEliteFewShotBlock(parent)).toBe('');
  });
});
