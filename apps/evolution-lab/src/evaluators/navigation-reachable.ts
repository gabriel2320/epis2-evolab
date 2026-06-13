import type { DeterministicEvaluator, EvaluatorContext } from './types.js';
import {
  getProcessTreeNodeById,
  getProcessTreeNodeByRoute,
  normalizeBrowserRoute,
  resolveCommandIntentRoute,
} from '../process-tree/catalog.js';

/**
 * S15.5 — browser.open debe resolver a nodo del árbol reconciliado EPIS2.
 */
export class NavigationReachableEvaluator implements DeterministicEvaluator {
  id = 'navigation_reachable';

  evaluate(ctx: EvaluatorContext) {
    const issues: string[] = [];

    if (ctx.processNodeId) {
      const declared = getProcessTreeNodeById(ctx.processNodeId);
      if (!declared) {
        issues.push(`processNodeId desconocido: ${ctx.processNodeId}`);
      }
    }

    if (ctx.commandIntent) {
      const route = resolveCommandIntentRoute(ctx.commandIntent);
      if (!route) {
        issues.push(`commandIntent sin snapshot: ${ctx.commandIntent}`);
      } else {
        const node = getProcessTreeNodeByRoute(route);
        if (!node) {
          issues.push(`commandIntent ${ctx.commandIntent} → ruta ${route} no está en árbol`);
        }
      }
    }

    for (const open of ctx.browserOpens ?? []) {
      const normalized = normalizeBrowserRoute(open);
      const node = getProcessTreeNodeByRoute(open);
      if (!node) {
        issues.push(`browser.open no mapea a árbol: ${normalized}`);
        continue;
      }
      if (ctx.processNodeId && node.id !== ctx.processNodeId) {
        issues.push(
          `processNodeId ${ctx.processNodeId} ≠ nodo de ruta ${node.id} (${normalized})`,
        );
      }
      if (node.status === 'deferred' || node.status === 'disabled') {
        issues.push(`nodo ${node.id} status=${node.status} — no operativo aún`);
      }
    }

    if (issues.length === 0) {
      return {
        runId: ctx.runId,
        evaluatorId: this.id,
        passed: true,
        severity: 'info' as const,
        message: 'Rutas browser alineadas al árbol EPIS2',
      };
    }

    return {
      runId: ctx.runId,
      evaluatorId: this.id,
      passed: false,
      severity: 'medium' as const,
      message: issues.join('; '),
      details: { issues },
    };
  }
}
