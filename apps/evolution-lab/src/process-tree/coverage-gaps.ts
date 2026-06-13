import type { ScenarioDefinition } from '../contracts/schemas.js';
import { isBrowserStep } from '../step-engine/schema.js';
import { NICHE_ROLES, NICHE_OUTCOMES, scenarioOutcome } from '../evolution/niches.js';
import {
  PROCESS_TREE_NODES,
  getProcessTreeNodeByRoute,
  normalizeBrowserRoute,
  resolveCommandIntentRoute,
} from './catalog.js';
import {
  assignWorkspaceNiche,
  enumerateWorkspaceNiches,
  workspaceNicheKey,
  type NicheWorkspace,
} from './workspaces.js';

export type ProcessTreeGap = {
  nodeId: string;
  labelEs: string;
  routeBase: string;
  workspace: string;
  status: string;
  priority: number;
  reason: string;
};

export type WorkspaceGap = {
  nicheKey: string;
  role: string;
  workspace: NicheWorkspace;
  outcome: string;
  priority: number;
};

export type ProcessTreeCoverageReport = {
  totalNodes: number;
  visitedNodeIds: string[];
  unvisitedNodes: ProcessTreeGap[];
  workspaceGaps: WorkspaceGap[];
  scenariosWithProcessNode: string[];
};

function nodePriority(node: { status: string; md3Level: number }): number {
  let p = 10 - node.md3Level;
  if (node.status === 'complete') p += 3;
  else if (node.status === 'partial') p += 1;
  else if (node.status === 'deferred') p -= 5;
  return p;
}

function collectVisitedNodeIds(scenarios: ScenarioDefinition[]): Set<string> {
  const visited = new Set<string>();
  for (const s of scenarios) {
    if (s.processNodeId) visited.add(s.processNodeId);
    if (s.commandIntent) {
      const route = resolveCommandIntentRoute(s.commandIntent);
      if (route) {
        const node = getProcessTreeNodeByRoute(route);
        if (node) visited.add(node.id);
      }
    }
    for (const step of s.flow ?? []) {
      if (isBrowserStep(step) && step.browser.open) {
        const node = getProcessTreeNodeByRoute(step.browser.open);
        if (node) visited.add(node.id);
      }
    }
  }
  return visited;
}

function collectOccupiedWorkspaceKeys(scenarios: ScenarioDefinition[]): Set<string> {
  const keys = new Set<string>();
  for (const s of scenarios) {
    const outcome = scenarioOutcome(s);
    keys.add(workspaceNicheKey(assignWorkspaceNiche(s, outcome)));
  }
  return keys;
}

/**
 * S15.3 — Cruce huecos catálogo ↔ nodos árbol no visitados por el corpus.
 */
export function buildProcessTreeCoverageGaps(
  scenarios: ScenarioDefinition[],
): ProcessTreeCoverageReport {
  const nodes = PROCESS_TREE_NODES();
  const visited = collectVisitedNodeIds(scenarios);
  const unvisitedNodes: ProcessTreeGap[] = [];

  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    if (node.status === 'deferred' || node.status === 'disabled') continue;
    unvisitedNodes.push({
      nodeId: node.id,
      labelEs: node.labelEs,
      routeBase: node.routeBase,
      workspace: node.workspace,
      status: node.status,
      priority: nodePriority(node),
      reason: 'sin escenario ni browser.open que alcance este nodo',
    });
  }
  unvisitedNodes.sort((a, b) => b.priority - a.priority);

  const occupiedWs = collectOccupiedWorkspaceKeys(scenarios);
  const allWs = enumerateWorkspaceNiches([...NICHE_ROLES], [...NICHE_OUTCOMES]);
  const workspaceGaps: WorkspaceGap[] = allWs
    .filter((n) => !occupiedWs.has(workspaceNicheKey(n)))
    .map((n) => ({
      nicheKey: workspaceNicheKey(n),
      role: n.role,
      workspace: n.workspace,
      outcome: n.outcome,
      priority: n.workspace === 'command' ? 5 : n.outcome === 'blocked' ? 4 : 2,
    }))
    .sort((a, b) => b.priority - a.priority);

  return {
    totalNodes: nodes.length,
    visitedNodeIds: [...visited].sort(),
    unvisitedNodes,
    workspaceGaps,
    scenariosWithProcessNode: scenarios.filter((s) => s.processNodeId).map((s) => s.id),
  };
}

export function extractBrowserRoutesFromCorpus(scenarios: ScenarioDefinition[]): string[] {
  const routes = new Set<string>();
  for (const s of scenarios) {
    for (const step of s.flow ?? []) {
      if (isBrowserStep(step) && step.browser.open) {
        routes.add(normalizeBrowserRoute(step.browser.open));
      }
    }
  }
  return [...routes].sort();
}
