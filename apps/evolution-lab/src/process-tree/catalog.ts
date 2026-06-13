import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type ProcessTreeNode = {
  id: string;
  labelEs: string;
  route: string;
  routeBase: string;
  kind: string;
  workspace: string;
  md3Level: number;
  status: 'complete' | 'partial' | 'missing' | 'disabled' | 'deferred' | string;
  blueprintId?: string;
  patientChartTab?: string;
  idcRefs?: number[];
  ola?: string;
  notes?: string;
};

export type ProcessTreeSnapshot = {
  exportedAt: string;
  source: string;
  nodeCount: number;
  nodes: ProcessTreeNode[];
};

export type CommandIntentSnapshot = {
  intent: string;
  labelEs: string;
  routePath: string;
  requiresPatient: boolean;
  requiredPermission: string;
};

export type CommandIntentsFile = {
  exportedAt: string;
  source: string;
  intentCount: number;
  commandIntents: CommandIntentSnapshot[];
};

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../data');

let cachedTree: ProcessTreeSnapshot | null = null;
let cachedIntents: CommandIntentsFile | null = null;

export function processTreeDataDir(): string {
  return DATA_DIR;
}

export function loadProcessTreeSnapshot(): ProcessTreeSnapshot {
  if (cachedTree) return cachedTree;
  const path = join(DATA_DIR, 'process-tree-snapshot.json');
  if (!existsSync(path)) {
    return {
      exportedAt: '',
      source: 'missing — npm run evolab:process-tree:export',
      nodeCount: 0,
      nodes: [],
    };
  }
  cachedTree = JSON.parse(readFileSync(path, 'utf8')) as ProcessTreeSnapshot;
  return cachedTree;
}

export function loadCommandIntentsSnapshot(): CommandIntentsFile {
  if (cachedIntents) return cachedIntents;
  const path = join(DATA_DIR, 'command-intents-snapshot.json');
  if (!existsSync(path)) {
    return {
      exportedAt: '',
      source: 'missing',
      intentCount: 0,
      commandIntents: [],
    };
  }
  cachedIntents = JSON.parse(readFileSync(path, 'utf8')) as CommandIntentsFile;
  return cachedIntents;
}

/** Reset cache — tests. */
export function resetProcessTreeCache(): void {
  cachedTree = null;
  cachedIntents = null;
}

export const PROCESS_TREE_NODES = (): ProcessTreeNode[] => loadProcessTreeSnapshot().nodes;

export function getProcessTreeNodeById(id: string): ProcessTreeNode | undefined {
  return PROCESS_TREE_NODES().find((n) => n.id === id);
}

export function getProcessTreeNodeByRoute(route: string): ProcessTreeNode | undefined {
  const normalized = normalizeBrowserRoute(route);
  return (
    PROCESS_TREE_NODES().find((n) => n.route === route || n.routeBase === normalized) ??
    PROCESS_TREE_NODES().find((n) => normalized.startsWith(n.routeBase))
  );
}

/** Normaliza URL browser.open → path base sin query ni host. */
export function normalizeBrowserRoute(open: string): string {
  const trimmed = open.trim();
  if (!trimmed) return '';
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const u = new URL(trimmed);
      return u.pathname.replace(/\$[a-zA-Z]+/g, ':param');
    }
  } catch {
    /* relative path */
  }
  const pathOnly = trimmed.split('?')[0] ?? trimmed;
  return pathOnly.replace(/\$[a-zA-Z]+/g, ':param');
}

export function listProcessTreeNodesByWorkspace(workspace: string): ProcessTreeNode[] {
  return PROCESS_TREE_NODES().filter((n) => n.workspace === workspace);
}

export function findCommandIntent(intent: string): CommandIntentSnapshot | undefined {
  return loadCommandIntentsSnapshot().commandIntents.find((c) => c.intent === intent);
}

export function resolveCommandIntentRoute(intent: string): string | undefined {
  return findCommandIntent(intent)?.routePath;
}
