import type { ScenarioDefinition } from '../contracts/schemas.js';
import { isBrowserStep } from '../step-engine/schema.js';
import {
  getProcessTreeNodeById,
  getProcessTreeNodeByRoute,
  normalizeBrowserRoute,
  resolveCommandIntentRoute,
} from './catalog.js';

/** Nichos workspace EPIS2 (S15.2) — paralelos a module niches. */
export const NICHE_WORKSPACES = [
  'command',
  'ambulatory',
  'inpatient',
  'icu',
  'quality',
  'admin',
  'global',
  'emergency',
  'reception',
] as const;

export type NicheWorkspace = (typeof NICHE_WORKSPACES)[number];

export type WorkspaceNiche = {
  role: string;
  workspace: NicheWorkspace;
  outcome: string;
};

const EPIS2_TO_NICHE_WORKSPACE: Record<string, NicheWorkspace> = {
  command: 'command',
  ambulatory: 'ambulatory',
  pharmacy_clinical: 'ambulatory',
  reception: 'reception',
  inpatient_ward: 'inpatient',
  intermediate_care: 'inpatient',
  icu: 'icu',
  emergency: 'emergency',
  quality_iaas: 'quality',
  admin_system: 'admin',
  global: 'global',
  reception_deferred: 'reception',
};

export function mapEpis2WorkspaceToNiche(workspace: string): NicheWorkspace {
  return EPIS2_TO_NICHE_WORKSPACE[workspace] ?? 'ambulatory';
}

export function workspaceNicheKey(n: WorkspaceNiche): string {
  return `ws|${n.role}|${n.workspace}|${n.outcome}`;
}

export function parseWorkspaceNicheKey(key: string): WorkspaceNiche | undefined {
  if (!key.startsWith('ws|')) return undefined;
  const [, role, workspace, outcome] = key.split('|');
  if (
    role &&
    workspace &&
    outcome &&
    (NICHE_WORKSPACES as readonly string[]).includes(workspace)
  ) {
    return { role, workspace: workspace as NicheWorkspace, outcome };
  }
  return undefined;
}

/** Workspace desde escenario: processNodeId > workspaceId > browser routes > tags visual. */
export function resolveScenarioWorkspace(scenario: ScenarioDefinition): NicheWorkspace {
  if (scenario.workspaceId) {
    return mapEpis2WorkspaceToNiche(scenario.workspaceId);
  }
  if (scenario.processNodeId) {
    const node = getProcessTreeNodeById(scenario.processNodeId);
    if (node) return mapEpis2WorkspaceToNiche(node.workspace);
  }
  if (scenario.tags?.includes('visual-paper') || scenario.tags?.includes('visual-classic')) {
    return 'ambulatory';
  }
  for (const step of scenario.flow ?? []) {
    if (isBrowserStep(step) && step.browser.open) {
      const node = getProcessTreeNodeByRoute(step.browser.open);
      if (node) return mapEpis2WorkspaceToNiche(node.workspace);
    }
  }
  return 'ambulatory';
}

export function assignWorkspaceNiche(
  scenario: ScenarioDefinition,
  outcome: string,
): WorkspaceNiche {
  return {
    role: scenario.persona.role,
    workspace: resolveScenarioWorkspace(scenario),
    outcome,
  };
}

export function enumerateWorkspaceNiches(roles: string[], outcomes: string[]): WorkspaceNiche[] {
  const niches: WorkspaceNiche[] = [];
  for (const role of roles) {
    for (const workspace of NICHE_WORKSPACES) {
      for (const outcome of outcomes) {
        niches.push({ role, workspace, outcome });
      }
    }
  }
  return niches;
}

export function inferProcessNodeFromScenario(scenario: ScenarioDefinition) {
  if (scenario.processNodeId) {
    return getProcessTreeNodeById(scenario.processNodeId);
  }
  for (const step of scenario.flow ?? []) {
    if (isBrowserStep(step) && step.browser.open) {
      const node = getProcessTreeNodeByRoute(step.browser.open);
      if (node) return node;
    }
  }
  if (scenario.commandIntent) {
    const route = resolveCommandIntentRoute(scenario.commandIntent);
    if (route) return getProcessTreeNodeByRoute(route);
  }
  return undefined;
}

export function collectBrowserRoutes(scenario: ScenarioDefinition): string[] {
  const routes: string[] = [];
  for (const step of scenario.flow ?? []) {
    if (isBrowserStep(step) && step.browser.open) {
      routes.push(normalizeBrowserRoute(step.browser.open));
    }
  }
  return routes;
}
