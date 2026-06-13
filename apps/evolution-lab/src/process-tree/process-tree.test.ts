import { describe, expect, it, beforeEach } from 'vitest';
import {
  getProcessTreeNodeByRoute,
  loadProcessTreeSnapshot,
  normalizeBrowserRoute,
  resetProcessTreeCache,
} from './catalog.js';
import { buildProcessTreeCoverageGaps } from './coverage-gaps.js';
import { mapEpis2WorkspaceToNiche, resolveScenarioWorkspace } from './workspaces.js';
import { ScenarioDefinitionSchema } from '../contracts/schemas.js';

describe('process-tree catalog', () => {
  beforeEach(() => resetProcessTreeCache());

  it('carga snapshot con nodos', () => {
    const snap = loadProcessTreeSnapshot();
    expect(snap.nodeCount).toBeGreaterThan(0);
    expect(snap.nodes.some((n) => n.id === 'command-home')).toBe(true);
  });

  it('normaliza rutas browser', () => {
    expect(normalizeBrowserRoute('/espacio/ficha?patientId=x')).toBe('/espacio/ficha');
    expect(normalizeBrowserRoute('http://127.0.0.1:5173/comando')).toBe('/comando');
  });

  it('resuelve nodo por ruta comando', () => {
    const node = getProcessTreeNodeByRoute('/comando');
    expect(node?.id).toBe('command-home');
  });
});

describe('process-tree coverage gaps', () => {
  beforeEach(() => resetProcessTreeCache());

  it('reporta nodos no visitados', () => {
    const scenario = ScenarioDefinitionSchema.parse({
      id: 'cmd-only',
      version: 1,
      name: 'cmd',
      risk: 'low',
      target: { capabilities: [] },
      persona: { role: 'physician' },
      goal: { action: 'open' },
      steps: ['browser'],
      flow: [{ browser: { label: 'home', open: '/comando' } }],
      expected: {},
      evaluators: ['functional'],
      processNodeId: 'command-home',
    });
    const report = buildProcessTreeCoverageGaps([scenario]);
    expect(report.visitedNodeIds).toContain('command-home');
    expect(report.totalNodes).toBeGreaterThan(report.visitedNodeIds.length);
  });
});

describe('workspace niche mapping', () => {
  it('mapea workspaces EPIS2', () => {
    expect(mapEpis2WorkspaceToNiche('quality_iaas')).toBe('quality');
    expect(mapEpis2WorkspaceToNiche('icu')).toBe('icu');
  });

  it('resuelve ambulatory desde tags visual', () => {
    const s = ScenarioDefinitionSchema.parse({
      id: 'vis',
      version: 1,
      name: 'vis',
      risk: 'low',
      target: { capabilities: [] },
      persona: { role: 'physician' },
      goal: { action: 'view' },
      steps: [],
      expected: {},
      evaluators: [],
      tags: ['visual-paper'],
    });
    expect(resolveScenarioWorkspace(s)).toBe('ambulatory');
  });
});
