import { describe, it, expect } from 'vitest';
import { resolveDevPlanLink, buildDevPlanActionItems, formatDevPlanBriefMarkdown } from './dev-plan.js';
import type { HypothesisRecord } from './registry.js';

const baseHyp = (over: Partial<HypothesisRecord>): HypothesisRecord => ({
  id: 'hyp-test',
  fingerprint: 'abc123def456',
  title: 'Test',
  status: 'open',
  owner: '',
  theme: 'C',
  priority: 'P1',
  notes: '',
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('dev-plan', () => {
  it('parsea dev-plan desde notas', () => {
    const link = resolveDevPlanLink(
      baseHyp({
        theme: 'E',
        notes:
          '[dev-plan:A-paper|MF-PA-01|quality:paper-mode-next|apps/web/|Fix paper cmd] extra',
      }),
    );
    expect(link.front).toBe('A-paper');
    expect(link.microphase).toBe('MF-PA-01');
    expect(link.gate).toBe('quality:paper-mode-next');
  });

  it('genera brief markdown con frentes EPIS2', () => {
    const items = buildDevPlanActionItems([
      baseHyp({ id: 'hyp-c-audit-trail', theme: 'C', priority: 'P1' }),
    ]);
    const md = formatDevPlanBriefMarkdown(items);
    expect(md).toContain('hyp-c-audit-trail');
    expect(md).toContain('PROG-EXPERIENCIA-CORE');
    expect(md).toContain('replay-fingerprint');
  });
});
