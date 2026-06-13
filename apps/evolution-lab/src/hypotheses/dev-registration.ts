import { listScenarios } from '../scenarios/loader.js';
import { buildFitnessReport } from '../fitness/report.js';
import { buildProcessTreeCoverageGaps } from '../process-tree/coverage-gaps.js';
import { readHypotheses } from './registry.js';
import { resolveDevPlanLink } from './dev-plan.js';

export type DevRegistrationKind =
  | 'product-hypothesis'
  | 'coverage-gap'
  | 'process-tree-gap'
  | 'lab-capability';

export type DevRegistrationEntry = {
  id: string;
  kind: DevRegistrationKind;
  status: 'open' | 'fixed' | 'wontfix' | 'deferred';
  priority: 'P0' | 'P1' | 'P2';
  title: string;
  owner: string;
  hypothesisId?: string;
  fingerprint?: string;
  epis2Front?: string;
  epis2Microphase?: string;
  epis2Gate?: string;
  epis2Paths?: string[];
  evolabAction: string;
  source: string;
  updatedAt: string;
};

const LAB_CAPABILITIES: DevRegistrationEntry[] = [
  {
    id: 'lab-llm-sim-command',
    kind: 'lab-capability',
    status: 'open',
    priority: 'P2',
    title: 'Escenarios plan/LLM requieren EPIS2_EVOLAB_LLM_SIM=execute',
    owner: '',
    epis2Front: 'infra',
    epis2Microphase: 'evolab-lab',
    epis2Gate: 'evolab:run',
    evolabAction:
      'Para llm-command-evolution-001: LLM_SIM=execute o escenario API declarativo equivalente (hyp-g)',
    source: 'scenarios/llm-command-evolution-001.yaml',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'lab-visual-smoke-profile',
    kind: 'lab-capability',
    status: 'open',
    priority: 'P2',
    title: 'Escenarios visual-paper/classic requieren perfil visual-smoke + browser',
    owner: '',
    epis2Front: 'infra',
    epis2Microphase: 'evolab-lab',
    epis2Gate: 'evolab:smoke:visual',
    evolabAction:
      'Ejecutar visual-* con EPIS2_EVOLAB_RUN_PROFILE=visual-smoke; vincular findings a hyp-e/hyp-f',
    source: 'scenarios/visual-paper-chart-001.yaml',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'lab-process-tree-snapshot',
    kind: 'lab-capability',
    status: 'open',
    priority: 'P2',
    title: 'Árbol de procesos EPIS2 — export periódico para navigation_reachable',
    owner: '',
    epis2Front: 'infra',
    epis2Microphase: 'evolab-S15',
    epis2Gate: 'evolab:process-tree:export',
    evolabAction: 'npm run evolab:process-tree:export antes de F5 dev-plan o tras cambios de rutas EPIS2',
    source: 'process-tree/catalog.ts',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'lab-scenario-process-node',
    kind: 'lab-capability',
    status: 'open',
    priority: 'P1',
    title: 'Corpus sin processNodeId — navigation_reachable limitado',
    owner: '',
    epis2Front: 'infra',
    epis2Microphase: 'evolab-S15',
    epis2Gate: 'evolab:fitness -- --gaps',
    evolabAction:
      'Añadir processNodeId o commandIntent a escenarios clave (admission, paper, command)',
    source: 'fitness report scenariosWithProcessNode=0',
    updatedAt: new Date().toISOString(),
  },
];

function hypothesisEntries(): DevRegistrationEntry[] {
  const now = new Date().toISOString();
  return readHypotheses().map((h) => {
    const plan = resolveDevPlanLink(h);
    return {
      id: `reg-${h.id}`,
      kind: 'product-hypothesis' as const,
      status: h.status === 'fixed' ? 'fixed' : h.status === 'wontfix' ? 'wontfix' : 'open',
      priority: h.priority,
      title: h.title,
      owner: h.owner,
      hypothesisId: h.id,
      fingerprint: h.fingerprint,
      epis2Front: plan.front,
      epis2Microphase: plan.microphase,
      epis2Gate: plan.gate,
      epis2Paths: plan.epis2Paths,
      evolabAction: plan.sessionAction,
      source: 'reports/evolution/hypotheses.jsonl',
      updatedAt: h.updatedAt || now,
    };
  });
}

function coverageGapEntries(scenarios: ReturnType<typeof listScenarios>): DevRegistrationEntry[] {
  const report = buildFitnessReport(scenarios);
  const now = new Date().toISOString();
  const entries: DevRegistrationEntry[] = [];

  for (const [i, endpoint] of report.gaps.endpoints.slice(0, 12).entries()) {
    entries.push({
      id: `cov-endpoint-${i + 1}`,
      kind: 'coverage-gap',
      status: 'open',
      priority: i < 4 ? 'P1' : 'P2',
      title: `Endpoint sin escenario: ${endpoint}`,
      owner: '',
      epis2Front: 'core-clinical',
      epis2Microphase: 'MF-CASE-*',
      epis2Gate: 'evolab:fitness -- --gaps',
      evolabAction: `Añadir step api o custom step que toque ${endpoint}`,
      source: 'fitness/coverage-catalog.ts',
      updatedAt: now,
    });
  }

  for (const [i, event] of report.gaps.auditEvents.slice(0, 8).entries()) {
    entries.push({
      id: `cov-audit-${i + 1}`,
      kind: 'coverage-gap',
      status: 'open',
      priority: 'P2',
      title: `Evento audit sin cubrir: ${event}`,
      owner: '',
      epis2Front: 'core-clinical',
      epis2Microphase: 'MF-CASE-*',
      epis2Gate: 'evolab:run',
      evolabAction: `Escenario con auditMustInclude: ${event}`,
      source: 'fitness/coverage-catalog.ts',
      updatedAt: now,
    });
  }

  return entries;
}

function processTreeGapEntries(scenarios: ReturnType<typeof listScenarios>): DevRegistrationEntry[] {
  const pt = buildProcessTreeCoverageGaps(scenarios);
  const now = new Date().toISOString();
  const entries: DevRegistrationEntry[] = [];

  for (const node of pt.unvisitedNodes.slice(0, 10)) {
    const front =
      node.workspace === 'paper'
        ? 'A-paper'
        : node.workspace === 'command'
          ? 'C-command'
          : node.workspace === 'chart'
            ? 'B-electronic'
            : 'core-clinical';
    entries.push({
      id: `pt-node-${node.nodeId}`,
      kind: 'process-tree-gap',
      status: 'open',
      priority: node.priority >= 8 ? 'P1' : 'P2',
      title: `Nodo árbol sin escenario: ${node.labelEs}`,
      owner: '',
      epis2Front: front,
      epis2Microphase:
        front === 'A-paper'
          ? 'MF-PA-01'
          : front === 'B-electronic'
            ? 'MF-TE-01'
            : front === 'C-command'
              ? 'MF-CM-01'
              : 'MF-CASE-*',
      epis2Gate: 'evolab:fitness -- --gaps',
      evolabAction: `YAML con browser.open ${node.routeBase} o commandIntent; processNodeId=${node.nodeId}`,
      source: `process-tree/${node.nodeId}`,
      updatedAt: now,
    });
  }

  for (const ws of pt.workspaceGaps.filter((w) => w.priority >= 4).slice(0, 6)) {
    entries.push({
      id: `pt-ws-${ws.nicheKey.replace(/\|/g, '-')}`,
      kind: 'process-tree-gap',
      status: 'open',
      priority: ws.priority >= 5 ? 'P1' : 'P2',
      title: `Workspace MAP sin escenario: ${ws.nicheKey}`,
      owner: '',
      epis2Front: ws.workspace === 'command' ? 'C-command' : 'core-clinical',
      epis2Microphase: ws.workspace === 'command' ? 'MF-CM-01' : 'MF-CASE-*',
      epis2Gate: 'evolab:evolve',
      evolabAction: `Crear escenario rol=${ws.role} workspace=${ws.workspace} outcome=${ws.outcome}`,
      source: 'process-tree/workspaces.ts',
      updatedAt: now,
    });
  }

  return entries;
}

export function buildDevRegistrationEntries(): DevRegistrationEntry[] {
  const scenarios = listScenarios();
  return [
    ...hypothesisEntries(),
    ...coverageGapEntries(scenarios),
    ...processTreeGapEntries(scenarios),
    ...LAB_CAPABILITIES,
  ];
}
