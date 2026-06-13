import {
  addHypothesis,
  findHypothesisByFingerprint,
  findHypothesisById,
  readHypotheses,
  updateHypothesis,
  type HypothesisStatus,
} from '../hypotheses/registry.js';
import { formatTraceabilityReport } from '../hypotheses/traceability.js';

export type HypothesisCommandOptions = {
  sub: 'list' | 'add' | 'update' | 'trace';
  json?: boolean;
  fingerprint?: string;
  id?: string;
  title?: string;
  owner?: string;
  theme?: string;
  priority?: 'P0' | 'P1' | 'P2';
  status?: HypothesisStatus;
  notes?: string;
  anchorFindingId?: string;
  anchorScenarioId?: string;
};

export async function runHypothesisCommand(opts: HypothesisCommandOptions): Promise<number> {
  switch (opts.sub) {
    case 'list': {
      const rows = readHypotheses();
      if (opts.json) {
        console.log(JSON.stringify(rows, null, 2));
        return 0;
      }
      console.log('EPIS2 Evolab — hypotheses registry\n');
      if (rows.length === 0) {
        console.log('  (vacío — usar hypothesis add)');
        return 0;
      }
      for (const h of rows) {
        console.log(
          `  ${h.id}  [${h.status}] ${h.priority}  fp=${h.fingerprint.slice(0, 12)}…  ${h.title}`,
        );
        if (h.owner) console.log(`         owner: ${h.owner}`);
      }
      return 0;
    }
    case 'add': {
      if (!opts.fingerprint || !opts.title) {
        console.error('Uso: evolab hypothesis add --fingerprint <fp> --title <texto> [--owner] [--theme] [--priority P0|P1|P2]');
        return 1;
      }
      try {
        const record = addHypothesis({
          fingerprint: opts.fingerprint,
          title: opts.title,
          ...(opts.owner ? { owner: opts.owner } : {}),
          ...(opts.theme ? { theme: opts.theme } : {}),
          ...(opts.priority ? { priority: opts.priority } : {}),
          ...(opts.notes ? { notes: opts.notes } : {}),
          ...(opts.anchorFindingId ? { anchorFindingId: opts.anchorFindingId } : {}),
          ...(opts.anchorScenarioId ? { anchorScenarioId: opts.anchorScenarioId } : {}),
        });
        console.log(`Hipótesis creada: ${record.id}`);
        if (opts.json) console.log(JSON.stringify(record, null, 2));
        return 0;
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        return 1;
      }
    }
    case 'update': {
      if (!opts.id) {
        console.error('Uso: evolab hypothesis update --id <hyp-id> [--status open|fixed|wontfix] [--owner] [--notes]');
        return 1;
      }
      try {
        const record = updateHypothesis(opts.id, {
          ...(opts.status ? { status: opts.status } : {}),
          ...(opts.owner !== undefined ? { owner: opts.owner } : {}),
          ...(opts.title ? { title: opts.title } : {}),
          ...(opts.notes !== undefined ? { notes: opts.notes } : {}),
          ...(opts.anchorFindingId ? { anchorFindingId: opts.anchorFindingId } : {}),
          ...(opts.anchorScenarioId ? { anchorScenarioId: opts.anchorScenarioId } : {}),
        });
        console.log(`Hipótesis actualizada: ${record.id} → ${record.status}`);
        if (opts.json) console.log(JSON.stringify(record, null, 2));
        return 0;
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        return 1;
      }
    }
    case 'trace': {
      const hypothesis = opts.id
        ? findHypothesisById(opts.id)
        : opts.fingerprint
          ? findHypothesisByFingerprint(opts.fingerprint)
          : undefined;
      if (!hypothesis) {
        console.error('Hipótesis no encontrada (--id o --fingerprint)');
        return 1;
      }
      console.log(formatTraceabilityReport(hypothesis));
      return 0;
    }
    default:
      console.error('Uso: evolab hypothesis list|add|update|trace');
      return 1;
  }
}
