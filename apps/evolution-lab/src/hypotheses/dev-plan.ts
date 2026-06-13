import type { HypothesisRecord } from './registry.js';
import { epis2PrLabel } from './traceability.js';

/** Frente del plan EPIS2 (PROG-EXPERIENCIA-CORE-2026). */
export type Epis2DevFront = 'A-paper' | 'B-electronic' | 'C-command' | 'core-clinical' | 'infra';

export type Epis2DevPlanLink = {
  front: Epis2DevFront;
  microphase: string;
  gate: string;
  epis2Paths: string[];
  /** Acción concreta para la siguiente sesión SDEPIS2. */
  sessionAction: string;
};

export type DevPlanActionItem = {
  hypothesisId: string;
  fingerprint: string;
  prLabel: string;
  priority: HypothesisRecord['priority'];
  status: HypothesisRecord['status'];
  title: string;
  devPlan: Epis2DevPlanLink;
  replayCommand: string;
};

const DEFAULT_DEV_PLAN_BY_THEME: Record<string, Partial<Epis2DevPlanLink>> = {
  A: {
    front: 'core-clinical',
    microphase: 'MF-CASE-*',
    gate: 'quality:golden-journey',
    epis2Paths: ['apps/api/src/clinical/', 'apps/api/src/inpatient/'],
    sessionAction: 'Fix clínico discharge/critical + replay fingerprint',
  },
  B: {
    front: 'core-clinical',
    microphase: 'MF-CASE-*',
    gate: 'quality:golden-journey',
    epis2Paths: ['apps/api/src/inpatient/routes.ts', 'apps/api/src/security/'],
    sessionAction: 'Ajustar RBAC draft.approve + test integración',
  },
  C: {
    front: 'core-clinical',
    microphase: 'MF-CASE-*',
    gate: 'npm run check',
    epis2Paths: ['apps/api/src/audit/'],
    sessionAction: 'Completar audit trail en flujo admission/discharge',
  },
  D: {
    front: 'core-clinical',
    microphase: 'MF-CASE-*',
    gate: 'quality:golden-journey',
    epis2Paths: ['apps/api/src/inpatient/', 'apps/api/src/clinical/'],
    sessionAction: 'Validar censo + critical cross-patient',
  },
  E: {
    front: 'A-paper',
    microphase: 'MF-PA-01',
    gate: 'quality:paper-mode-next',
    epis2Paths: ['packages/command-registry/src/paper-commands.ts', 'apps/web/src/modes/paper/'],
    sessionAction: 'Corregir comando papel / RBAC según finding evolab',
  },
  F: {
    front: 'B-electronic',
    microphase: 'MF-TE-01',
    gate: 'quality:dual-chart-gate',
    epis2Paths: ['apps/web/src/pages/GeneratedClinicalFormPage.tsx', 'packages/clinical-forms/'],
    sessionAction: 'Staging sección vacía / navegación dual-chart',
  },
  G: {
    front: 'C-command',
    microphase: 'MF-CM-01',
    gate: 'test:e2e:ux-g02',
    epis2Paths: ['apps/api/src/commands/', 'apps/api/src/ai/routes.ts'],
    sessionAction: 'Límite assist borrador vs SoT en barra NL',
  },
  H3: {
    front: 'infra',
    microphase: 'evolab-F3',
    gate: 'evolab:pre-evolve-smoke',
    epis2Paths: ['epis2-evolab/apps/evolution-lab/src/fixtures/sandbox-prep.ts'],
    sessionAction: 'Verificar fixture-policy en mutantes antes de fix producto',
  },
};

function parseDevPlanFromNotes(notes: string): Partial<Epis2DevPlanLink> | undefined {
  const match = notes.match(/\[dev-plan:([^\]]+)\]/);
  if (!match) return undefined;
  const parts = match[1]!.split('|').map((p) => p.trim());
  return {
    front: parts[0] as Epis2DevFront,
    microphase: parts[1] ?? '',
    gate: parts[2] ?? '',
    epis2Paths: parts[3] ? parts[3].split(',') : [],
    sessionAction: parts[4] ?? '',
  };
}

export function resolveDevPlanLink(hypothesis: HypothesisRecord): Epis2DevPlanLink {
  const fromNotes = parseDevPlanFromNotes(hypothesis.notes);
  const fromTheme = DEFAULT_DEV_PLAN_BY_THEME[hypothesis.theme] ?? {};
  const fallback: Epis2DevPlanLink = {
    front: 'core-clinical',
    microphase: 'MF-CASE-*',
    gate: 'npm run check',
    epis2Paths: ['apps/api/src/'],
    sessionAction: 'Replay fingerprint + fix mínimo en sandbox EPIS2',
  };
  return {
    ...fallback,
    ...fromTheme,
    ...fromNotes,
    microphase: fromNotes?.microphase ?? fromTheme.microphase ?? fallback.microphase,
    gate: fromNotes?.gate ?? fromTheme.gate ?? fallback.gate,
    sessionAction:
      fromNotes?.sessionAction ??
      fromTheme.sessionAction ??
      (hypothesis.notes || fallback.sessionAction),
    epis2Paths:
      fromNotes?.epis2Paths?.length
        ? fromNotes.epis2Paths
        : fromTheme.epis2Paths?.length
          ? fromTheme.epis2Paths
          : fallback.epis2Paths,
  };
}

export function buildDevPlanActionItems(
  hypotheses: HypothesisRecord[],
): DevPlanActionItem[] {
  return hypotheses
    .filter((h) => h.status === 'open' && (h.priority === 'P0' || h.priority === 'P1'))
    .sort((a, b) => {
      const pri = (p: string) => (p === 'P0' ? 0 : p === 'P1' ? 1 : 2);
      return pri(a.priority) - pri(b.priority) || a.id.localeCompare(b.id);
    })
    .map((h) => ({
      hypothesisId: h.id,
      fingerprint: h.fingerprint,
      prLabel: epis2PrLabel(h.fingerprint),
      priority: h.priority,
      status: h.status,
      title: h.title,
      devPlan: resolveDevPlanLink(h),
      replayCommand: `npm run evolab:replay-fingerprint -- ${h.fingerprint.slice(0, 16)}`,
    }));
}

export function formatDevPlanBriefMarkdown(
  items: DevPlanActionItem[],
  opts: { runId?: string; evolveTelemetry?: string } = {},
): string {
  const lines = [
    '# Evolab → EPIS2 — Brief plan de desarrollo',
    '',
    `Generado: ${new Date().toISOString().slice(0, 10)}`,
    ...(opts.runId ? [`F5 run: \`${opts.runId}\``] : []),
    ...(opts.evolveTelemetry ? [`Telemetría: \`${opts.evolveTelemetry}\``] : []),
    '',
    '> Resultados accionables para **PROG-EXPERIENCIA-CORE** · un frente por sesión SDEPIS2.',
    '',
    '## Hipótesis abiertas (prioridad)',
    '',
  ];

  if (items.length === 0) {
    lines.push('_Sin hipótesis P0/P1 abiertas — revisar findings nuevos post-F5._');
  } else {
    for (const item of items) {
      lines.push(`### ${item.hypothesisId} · ${item.title}`);
      lines.push('');
      lines.push(`| Campo | Valor |`);
      lines.push(`|-------|-------|`);
      lines.push(`| Prioridad | ${item.priority} |`);
      lines.push(`| Frente EPIS2 | ${item.devPlan.front} |`);
      lines.push(`| Microfase | \`${item.devPlan.microphase}\` |`);
      lines.push(`| Gate cierre | \`${item.devPlan.gate}\` |`);
      lines.push(`| PR label | \`${item.prLabel}\` |`);
      lines.push('');
      lines.push('**Archivos EPIS2 sugeridos:**');
      for (const p of item.devPlan.epis2Paths) {
        lines.push(`- \`${p}\``);
      }
      lines.push('');
      lines.push(`**Sesión:** ${item.devPlan.sessionAction}`);
      lines.push('');
      lines.push('```bash');
      lines.push(item.replayCommand);
      lines.push('```');
      lines.push('');
    }
  }

  lines.push('## Reglas sesión (canon EPIS2)');
  lines.push('');
  lines.push('1. Elegir **un frente** (A papel · B electrónica · C comando+IA · core clínico).');
  lines.push('2. Declarar alcance MF + archivos allowlist.');
  lines.push('3. Fix sandbox → replay fingerprint verde → `npm run check` + gate del frente.');
  lines.push('4. PR EPIS2 con etiqueta `evolab-fp-*` + `hypothesis update --status fixed`.');
  lines.push('');
  lines.push('Ver: `docs/product/EPIS2_TABLERO.md` · `docs/evolution/F5_DEV_PLAN_RUNBOOK.md`');
  return lines.join('\n');
}
