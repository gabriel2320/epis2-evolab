import type { ScenarioDefinition } from '../contracts/schemas.js';
import { getEvolabSql } from '../persistence/client.js';
import {
  computeScenarioStructuralSignature,
  extractBaseScenarioId,
} from './fingerprint-structural.js';

export type FingerprintLedgerRow = {
  fingerprint: string;
  judgeVerdict: string | null;
  reviewStatus: string;
  findingCount: number;
  openCount: number;
  scenarioCount: number;
  maxSeverity: string | null;
  lastSeenAt: string | null;
};

export type FingerprintLedger = {
  rows: FingerprintLedgerRow[];
  /** fingerprint → open signal count */
  openSignalByFingerprint: Map<string, number>;
  /** structural signature → open signal count */
  openSignalByStructural: Map<string, number>;
  /** base scenario id → open signal count */
  openSignalByBaseScenario: Map<string, number>;
  loadedAt: string;
};

export type SandboxSkipDecision = {
  skip: boolean;
  reason?: string;
  structuralSignature?: string;
  matchedFingerprint?: string;
};

const EMPTY_LEDGER: FingerprintLedger = {
  rows: [],
  openSignalByFingerprint: new Map(),
  openSignalByStructural: new Map(),
  openSignalByBaseScenario: new Map(),
  loadedAt: new Date(0).toISOString(),
};

export async function loadFingerprintLedger(
  databaseUrl: string | undefined,
): Promise<FingerprintLedger> {
  if (!databaseUrl) return { ...EMPTY_LEDGER, loadedAt: new Date().toISOString() };

  const sql = getEvolabSql(databaseUrl);

  let viewRows: FingerprintLedgerRow[] = [];
  try {
    const raw = await sql<
      {
        fingerprint: string;
        judge_verdict: string | null;
        review_status: string;
        finding_count: number;
        open_count: number;
        scenario_count: number;
        max_severity: string | null;
        last_seen_at: Date | null;
      }[]
    >`
      SELECT fingerprint, judge_verdict, review_status, finding_count, open_count,
             scenario_count, max_severity, last_seen_at
      FROM evolution.fingerprint_ledger
      ORDER BY finding_count DESC
    `;
    viewRows = raw.map((r) => ({
      fingerprint: r.fingerprint,
      judgeVerdict: r.judge_verdict,
      reviewStatus: r.review_status,
      findingCount: r.finding_count,
      openCount: r.open_count,
      scenarioCount: r.scenario_count,
      maxSeverity: r.max_severity,
      lastSeenAt: r.last_seen_at?.toISOString() ?? null,
    }));
  } catch {
    viewRows = [];
  }

  const openSignalByFingerprint = new Map<string, number>();
  for (const row of viewRows) {
    if (row.judgeVerdict === 'signal' && row.reviewStatus === 'open') {
      openSignalByFingerprint.set(row.fingerprint, row.openCount);
    }
  }

  const openSignalByStructural = new Map<string, number>();
  const openSignalByBaseScenario = new Map<string, number>();

  try {
    const detail = await sql<
      {
        fingerprint: string;
        structural_signature: string | null;
        scenario_id: string;
        cnt: number;
      }[]
    >`
      SELECT fingerprint, structural_signature, scenario_id, COUNT(*)::int AS cnt
      FROM evolution.findings
      WHERE review_status = 'open' AND judge_verdict = 'signal'
      GROUP BY fingerprint, structural_signature, scenario_id
    `;

    for (const row of detail) {
      openSignalByFingerprint.set(
        row.fingerprint,
        (openSignalByFingerprint.get(row.fingerprint) ?? 0) + row.cnt,
      );
      if (row.structural_signature) {
        openSignalByStructural.set(
          row.structural_signature,
          (openSignalByStructural.get(row.structural_signature) ?? 0) + row.cnt,
        );
      }
      const base = extractBaseScenarioId(row.scenario_id);
      openSignalByBaseScenario.set(base, (openSignalByBaseScenario.get(base) ?? 0) + row.cnt);
    }
  } catch {
    /* column structural_signature puede no existir antes de migrate */
  }

  return {
    rows: viewRows,
    openSignalByFingerprint,
    openSignalByStructural,
    openSignalByBaseScenario,
    loadedAt: new Date().toISOString(),
  };
}

/** Evolve no re-ejecuta sandbox si el cluster estructural ya tiene signal open (S14.1). */
export function shouldSkipSandboxRun(
  scenario: ScenarioDefinition,
  ledger: FingerprintLedger,
): SandboxSkipDecision {
  const structuralSignature = computeScenarioStructuralSignature(scenario);
  const structHits = ledger.openSignalByStructural.get(structuralSignature) ?? 0;
  if (structHits > 0) {
    return {
      skip: true,
      reason: `ledger_structural_signal:${structHits}`,
      structuralSignature,
    };
  }

  const baseId = extractBaseScenarioId(scenario.id);
  const baseHits = ledger.openSignalByBaseScenario.get(baseId) ?? 0;
  if (baseHits >= 3 && scenario.id !== baseId) {
    return {
      skip: true,
      reason: `ledger_base_scenario_saturated:${baseId}:${baseHits}`,
      structuralSignature,
    };
  }

  return { skip: false, structuralSignature };
}

/** Penalización MAP-Elites por fingerprint signal saturado (S14.5). */
export function countOpenSignalHits(
  scenario: ScenarioDefinition,
  ledger: FingerprintLedger,
): number {
  const sig = computeScenarioStructuralSignature(scenario);
  const byStruct = ledger.openSignalByStructural.get(sig) ?? 0;
  const base = extractBaseScenarioId(scenario.id);
  const byBase = ledger.openSignalByBaseScenario.get(base) ?? 0;
  return Math.max(byStruct, byBase >= 3 ? byBase : 0);
}

export function ledgerSummary(ledger: FingerprintLedger): {
  openSignalFingerprints: number;
  openSignalFindings: number;
  structuralClusters: number;
} {
  let openSignalFindings = 0;
  for (const n of ledger.openSignalByFingerprint.values()) openSignalFindings += n;
  return {
    openSignalFingerprints: ledger.openSignalByFingerprint.size,
    openSignalFindings,
    structuralClusters: ledger.openSignalByStructural.size,
  };
}
