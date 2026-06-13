/**
 * Exporta snapshot del árbol EPIS2 + command intents sin acoplar runtime.
 * Uso: npm run evolab:process-tree:export [-- --epis2=../EPIS2]
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const epis2Arg = process.argv.find((a) => a.startsWith('--epis2='));
const EPIS2_ROOT = resolve(epis2Arg?.split('=')[1] ?? join(ROOT, '..', 'EPIS2'));

function parseSurfaceLiterals(ts) {
  const nodes = [];
  const blockRe =
    /\{\s*id:\s*'([^']+)'[\s\S]*?labelEs:\s*'([^']*)'[\s\S]*?route:\s*'([^']+)'[\s\S]*?kind:\s*'([^']+)'[\s\S]*?workspace:\s*'([^']+)'[\s\S]*?md3Level:\s*(\d+)[\s\S]*?status:\s*'([^']+)'[\s\S]*?\}/g;
  for (const m of ts.matchAll(blockRe)) {
    const block = m[0];
    const idcMatch = block.match(/idcRefs:\s*\[([\d,\s]+)\]/);
    const blueprintMatch = block.match(/blueprintId:\s*'([^']+)'/);
    const tabMatch = block.match(/patientChartTab:\s*'([^']+)'/);
    const olaMatch = block.match(/ola:\s*'([^']+)'/);
    const notesMatch = block.match(/notes:\s*'([^']+)'/);
    const route = m[3];
    nodes.push({
      id: m[1],
      labelEs: m[2],
      route,
      routeBase: route.split('?')[0].replace(/\$[a-zA-Z]+/g, ':param'),
      kind: m[4],
      workspace: m[5],
      md3Level: Number.parseInt(m[6], 10),
      status: m[7],
      ...(blueprintMatch ? { blueprintId: blueprintMatch[1] } : {}),
      ...(tabMatch ? { patientChartTab: tabMatch[1] } : {}),
      ...(idcMatch
        ? {
            idcRefs: idcMatch[1]
              .split(',')
              .map((s) => Number.parseInt(s.trim(), 10))
              .filter(Number.isFinite),
          }
        : {}),
      ...(olaMatch ? { ola: olaMatch[1] } : {}),
      ...(notesMatch ? { notes: notesMatch[1] } : {}),
    });
  }
  return nodes;
}

function parseBlueprintFiles(epis2Root) {
  const dir = join(epis2Root, 'packages/clinical-forms/src/blueprints');
  const nodes = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
    const content = readFileSync(join(dir, file), 'utf8');
    const id = content.match(/blueprintId:\s*'([^']+)'/)?.[1];
    const route = content.match(/routePath:\s*'([^']+)'/)?.[1];
    const label = content.match(/label:\s*'([^']+)'/)?.[1];
    if (!id || !route) continue;
    if (nodes.some((n) => n.id === `form-${id}`)) continue;
    nodes.push({
      id: `form-${id}`,
      labelEs: label ?? id,
      route,
      routeBase: route.split('?')[0],
      kind: 'clinical_form',
      workspace: 'ambulatory',
      md3Level: 3,
      status: 'partial',
      blueprintId: id,
    });
  }
  return nodes;
}

function parseRoutePaths(routesTs) {
  const map = {};
  for (const m of routesTs.matchAll(/(\w+):\s*'([^']+)'/g)) {
    map[m[1]] = m[2];
  }
  return map;
}

function parseCommandIntents(definitionsTs, routePaths) {
  const intents = [];
  const blocks = definitionsTs.split(/\n\s*\{\s*\n\s*intent:/).slice(1);
  for (const chunk of blocks) {
    const intent = chunk.match(/^ '([^']+)'/)?.[1] ?? chunk.match(/^ '([^']+)'/m)?.[1];
    if (!intent) continue;
    const full = `intent: '${intent}'` + chunk;
    const labelEs = full.match(/labelEs:\s*'([^']*)'/)?.[1];
    const routeRef = full.match(/routePath:\s*INTENT_ROUTE_PATHS\.(\w+)/)?.[1];
    const routeLiteral = full.match(/routePath:\s*'([^']+)'/)?.[1];
    const routePath = routeLiteral ?? (routeRef ? routePaths[routeRef] : undefined);
    const requiresPatient = /requiresPatient:\s*true/.test(full);
    const requiredPermission =
      full.match(/requiredPermission:\s*'([^']+)'/)?.[1] ?? 'command.execute';
    if (!labelEs || !routePath) continue;
    intents.push({ intent, labelEs, routePath, requiresPatient, requiredPermission });
  }
  return intents;
}

function dedupeNodes(nodes) {
  const byId = new Map();
  for (const n of nodes) byId.set(n.id, n);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function main() {
  const treePath = join(EPIS2_ROOT, 'apps/web/src/navigation/epis2NavigationTree.ts');
  const defsPath = join(EPIS2_ROOT, 'packages/command-registry/src/definitions.ts');
  const routesPath = join(EPIS2_ROOT, 'packages/command-registry/src/routes.ts');

  const treeTs = readFileSync(treePath, 'utf8');
  const defsTs = readFileSync(defsPath, 'utf8');
  const routesTs = readFileSync(routesPath, 'utf8');
  const routePaths = parseRoutePaths(routesTs);

  const literalNodes = parseSurfaceLiterals(treeTs);
  const blueprintNodes = parseBlueprintFiles(EPIS2_ROOT);
  const nodes = dedupeNodes([...literalNodes, ...blueprintNodes]);
  const commandIntents = parseCommandIntents(defsTs, routePaths);

  const outDir = join(ROOT, 'apps/evolution-lab/data');
  mkdirSync(outDir, { recursive: true });

  const treeSnapshot = {
    exportedAt: new Date().toISOString(),
    source: 'EPIS2 epis2NavigationTree.ts + clinical-forms blueprints',
    epis2Root: EPIS2_ROOT,
    nodeCount: nodes.length,
    nodes,
  };

  const intentSnapshot = {
    exportedAt: new Date().toISOString(),
    source: 'EPIS2 command-registry/definitions.ts',
    intentCount: commandIntents.length,
    commandIntents,
  };

  writeFileSync(join(outDir, 'process-tree-snapshot.json'), JSON.stringify(treeSnapshot, null, 2), 'utf8');
  writeFileSync(join(outDir, 'command-intents-snapshot.json'), JSON.stringify(intentSnapshot, null, 2), 'utf8');

  console.log(`EPIS2 Evolab — process tree export`);
  console.log(`  Nodos:   ${nodes.length} → apps/evolution-lab/data/process-tree-snapshot.json`);
  console.log(`  Intents: ${commandIntents.length} → apps/evolution-lab/data/command-intents-snapshot.json`);
}

main();
