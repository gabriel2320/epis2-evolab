import type { HypothesisRecord } from './registry.js';

/** Etiqueta PR EPIS2: `evolab-fp-<hash12>` (S16.4). */
export function epis2PrLabel(fingerprint: string): string {
  const hash = fingerprint.trim().toLowerCase().replace(/[^a-f0-9]/g, '').slice(0, 12);
  return `evolab-fp-${hash}`;
}

export type TraceabilityChecklist = {
  prLabel: string;
  requiresGoldenJourney: boolean;
  items: string[];
};

export function buildTraceabilityChecklist(hypothesis: HypothesisRecord): TraceabilityChecklist {
  const prLabel = epis2PrLabel(hypothesis.fingerprint);
  const discharge =
    /discharge|alta|critical_pending|rbac|functional/i.test(hypothesis.title) ||
    /discharge|critical|rbac|A|B|D/i.test(hypothesis.theme);
  const critical = hypothesis.priority === 'P0' || /critical|crítico|P0/i.test(hypothesis.title);

  const requiresGoldenJourney = discharge || critical;
  const items: string[] = [
    `PR EPIS2: etiqueta \`${prLabel}\` en título o descripción`,
    'Enlazar hipótesis evolab en cuerpo del PR (id + fingerprint)',
    'Sandbox EPIS2: npm run check en repo EPIS2',
  ];

  if (requiresGoldenJourney) {
    items.push('Gate: npm run quality:golden-journey (EPIS2) si toca discharge/critical');
    items.push('Replay ancla: evolab replay-fingerprint ' + hypothesis.fingerprint.slice(0, 12));
    items.push('Validar escenario base YAML antes del mutante ancla');
  }

  return { prLabel, requiresGoldenJourney, items };
}

export function formatTraceabilityReport(hypothesis: HypothesisRecord): string {
  const checklist = buildTraceabilityChecklist(hypothesis);
  const lines = [
    `Hipótesis ${hypothesis.id} · ${hypothesis.title}`,
    `Fingerprint: ${hypothesis.fingerprint}`,
    `Estado: ${hypothesis.status} · Prioridad: ${hypothesis.priority}`,
    `PR label: ${checklist.prLabel}`,
    '',
    'Checklist EPIS2:',
    ...checklist.items.map((item) => `  • ${item}`),
  ];
  return lines.join('\n');
}
