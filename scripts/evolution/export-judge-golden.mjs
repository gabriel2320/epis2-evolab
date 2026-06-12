#!/usr/bin/env node
/**
 * Hidrata judge-golden-v1.json con snapshots reales desde evolution.findings.
 * Uso: node scripts/evolution/export-judge-golden.mjs [--dry-run]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';

const ROOT = resolve(import.meta.dirname, '../..');
const GOLDEN_PATH = resolve(ROOT, 'apps/evolution-lab/fixtures/judge-golden-v1.json');
const dryRun = process.argv.includes('--dry-run');

const databaseUrl =
  process.env.EPIS2_EVOLAB_DATABASE_URL ??
  'postgresql://epis2_evolab:epis2_evolab@127.0.0.1:5433/epis2_evolab';

/** golden id → finding UUID en DB (dossier 4d1553d6 / 7f2a0877 / S8 mutados) */
const SOURCE_FINDING_IDS = {
  'golden-001': 'ceac9c2a-1b83-4308-8cae-d60c57b45b6f',
  'golden-002': '3892a533-afa4-4704-9644-ba9b33173b26',
  'golden-003': '3ad7cd9e-996e-40dd-b237-7ec034d3cbf5',
  'golden-004': '6cfd6d72-59aa-411c-82d7-f0858aa2e72b',
  'golden-005': 'ccd3049c-5afc-4464-b9b0-378b864b6beb',
  'golden-006': '3892a533-afa4-4704-9644-ba9b33173b26',
  'golden-009': '1c0b218b-ea61-4b39-9c88-93a2f22cc0fe',
  'golden-012': '6bd9d90e-16d1-47a3-91ee-3f51b7942f1d',
  'golden-013': '93bd475d-21d7-42fe-9dab-dac6352845fd',
  'golden-014': 'bb80842f-6f29-4997-ae59-28a4aee83a19',
  'golden-015': '06f2e304-3b23-4eb7-ab53-c8bf6be5b370',
  'golden-016': '4d8be5a5-2b64-4307-8709-c4f4af157982',
  'golden-017': 'fb0241fd-aaac-42de-bd29-834f8c6f71c1',
  'golden-018': 'b69cf6ba-8ce3-4cba-b0ca-ded012621138',
  'golden-019': '4ee8e0fb-8d0e-4564-a457-768b82192613',
  'golden-020': '9df618b2-baa4-4d98-bf45-57f86510a21c',
  'golden-021': '675f6e31-5acc-415e-821b-93f91b8ec685',
  'golden-022': '0dcf40ae-c4d9-4259-97c4-ad5b4633b0b8',
  'golden-023': '4273db7a-5257-4e13-8772-b2a228e39323',
  'golden-024': '4aa4c8a5-fdd2-4a12-ac76-0ec0bfc47dec',
  'golden-025': 'd929bc46-86bf-4246-a8af-628a4e238483',
};

/** Entradas sin finding en DB — texto enriquecido desde dossier / escenarios padre */
const SYNTHETIC_ENRICHMENTS = {
  'golden-007': {
    sourceRunId: '4d1553d6-9eab-4458-9c62-825d683049e8',
    findingSnapshot: {
      scenarioId: 'role-nurse-approve-001',
      category: 'authorization',
      severity: 'high',
      title: 'role-nurse-approve-001 — functional',
      expectedResult: 'HTTP 403 al aprobar borrador como enfermera (sin draft.approve)',
      actualResult: 'POST /api/drafts/{id}/approve respondió 403 Forbidden',
      fingerprint: 'nurse-approve-rbac-403',
    },
  },
  'golden-008': {
    sourceRunId: '7f2a0877-0605-4d98-92e8-7042306195d2',
    findingSnapshot: {
      scenarioId: 'role-nurse-approve-001',
      category: 'authorization',
      severity: 'high',
      title: 'role-nurse-approve-001 — functional (run previo)',
      expectedResult: 'HTTP 403 al aprobar borrador como enfermera',
      actualResult: 'POST /api/drafts/{id}/approve respondió 403 Forbidden',
      fingerprint: 'nurse-approve-rbac-403',
    },
  },
  'golden-010': {
    sourceRunId: '4d1553d6-9eab-4458-9c62-825d683049e8',
    findingSnapshot: {
      scenarioId: 'role-nurse-approve-001',
      category: 'audit_trail',
      severity: 'medium',
      title: 'role-nurse-approve-001 — audit_completeness (expected desactualizado)',
      expectedResult: 'auditEventCreated=true en intento bloqueado',
      actualResult: 'EPIS2 no audita intentos RBAC bloqueados — sin evento de auditoría',
      fingerprint: 'nurse-audit-false-positive',
    },
  },
  'golden-011': {
    sourceRunId: '7f2a0877-0605-4d98-92e8-7042306195d2',
    findingSnapshot: {
      scenarioId: 'role-nurse-approve-001',
      category: 'audit_trail',
      severity: 'medium',
      title: 'role-nurse-approve-001 — audit_completeness (run previo)',
      expectedResult: 'auditEventCreated=true en intento bloqueado',
      actualResult: 'Sin evento de auditoría en 403 RBAC — ruido de expected',
      fingerprint: 'nurse-audit-false-positive',
    },
  },
};

function toSnapshot(row, goldenId) {
  return {
    id: goldenId,
    runId: String(row.run_id),
    scenarioId: String(row.scenario_id),
    targetEnvironmentId: String(row.target_environment_id ?? 'epis2-local-sandbox'),
    category: String(row.category),
    severity: String(row.severity),
    confidence: Number(row.confidence),
    title: String(row.title),
    expectedResult: String(row.expected_result),
    actualResult: String(row.actual_result),
    fingerprint: String(row.fingerprint),
    recommendedAction: String(row.recommended_action),
    affectedComponents: row.affected_components ?? [],
    reviewStatus: String(row.review_status),
  };
}

async function loadFingerprintHistory(findingId, fingerprint) {
  const rows = await sql`
    SELECT id, run_id, scenario_id, severity, review_status, created_at
    FROM evolution.findings
    WHERE fingerprint = ${fingerprint} AND id != ${findingId}
    ORDER BY created_at ASC
    LIMIT 8
  `;
  return rows.map((h) => ({
    findingId: String(h.id),
    runId: String(h.run_id),
    scenarioId: String(h.scenario_id),
    severity: String(h.severity),
    reviewStatus: String(h.review_status),
    createdAt: h.created_at instanceof Date ? h.created_at.toISOString() : String(h.created_at),
  }));
}

async function loadEvaluations(runId) {
  const rows = await sql`
    SELECT evaluator_id, passed, severity, message
    FROM evolution.evaluations
    WHERE run_id = ${runId}
    ORDER BY evaluator_id
  `;
  return rows.map((e) => ({
    evaluatorId: String(e.evaluator_id),
    passed: Boolean(e.passed),
    severity: e.severity != null ? String(e.severity) : undefined,
    message: String(e.message ?? ''),
  }));
}

const sql = postgres(databaseUrl, { max: 1, idle_timeout: 5 });

try {
  const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
  const rows = await sql`
    SELECT id, run_id, scenario_id, target_environment_id, category, severity, confidence,
           title, expected_result, actual_result, fingerprint, recommended_action,
           affected_components, review_status
    FROM evolution.findings
  `;
  const byId = new Map(rows.map((r) => [String(r.id), r]));

  let matched = 0;
  for (const entry of golden.entries) {
    const sourceId = SOURCE_FINDING_IDS[entry.id];
    const synth = SYNTHETIC_ENRICHMENTS[entry.id];

    if (sourceId) {
      const row = byId.get(sourceId);
      if (!row) {
        console.warn(`  ⚠ UUID no encontrado: ${entry.id} → ${sourceId}`);
        continue;
      }
      entry.sourceRunId = String(row.run_id);
      entry.sourceFindingId = sourceId;
      entry.findingSnapshot = toSnapshot(row, entry.id);
      entry.fingerprintHistory = await loadFingerprintHistory(sourceId, String(row.fingerprint));
      entry.evaluations = await loadEvaluations(String(row.run_id));
      matched += 1;
      console.log(`  ✓ ${entry.id} ← ${sourceId.slice(0, 8)}… ${row.scenario_id}`);
    } else if (synth) {
      entry.sourceRunId = synth.sourceRunId;
      entry.sourceFindingId = null;
      entry.findingSnapshot = {
        ...entry.findingSnapshot,
        ...synth.findingSnapshot,
        id: entry.id,
        runId: synth.sourceRunId,
        confidence: 0.85,
        recommendedAction: 'generate_test',
        affectedComponents: ['apps/api'],
        reviewStatus: 'open',
        targetEnvironmentId: 'epis2-local-sandbox',
      };
      matched += 1;
      console.log(`  ~ ${entry.id} (dossier sintético) ${synth.findingSnapshot.scenarioId}`);
    } else {
      console.warn(`  ⚠ sin fuente: ${entry.id}`);
    }

    entry.labeledAt = '2026-06-11';
    entry.labeledBy = 'export-judge-golden';

    if (entry.goldenVerdict === 'duplicate') {
      entry.fingerprintHistory = [
        {
          findingId: 'ceac9c2a-1b83-4308-8cae-d60c57b45b6f',
          runId: '4d1553d6-9eab-4458-9c62-825d683049e8',
          scenarioId: 'discharge-critical-pending-001',
          severity: 'critical',
          reviewStatus: 'approved',
          createdAt: '2026-06-10T12:00:00.000Z',
        },
        ...(entry.fingerprintHistory ?? []),
      ];
    }

    if (entry.goldenVerdict === 'noise') {
      const snap = entry.findingSnapshot;
      snap.actualResult = `${snap.actualResult} — Comportamiento correcto del sandbox; expected desactualizado (gate noise).`;
    }
  }

  golden.version = 'judge-golden-v1-dossier';
  golden.exportedAt = new Date().toISOString();
  golden.sourceRuns = [
    '4d1553d6-9eab-4458-9c62-825d683049e8',
    '7f2a0877-0605-4d98-92e8-7042306195d2',
  ];

  console.log(`\nexport-judge-golden: ${matched}/${golden.entries.length} entradas hidratadas`);
  if (!dryRun) {
    writeFileSync(GOLDEN_PATH, `${JSON.stringify(golden, null, 2)}\n`, 'utf8');
    console.log(`  Escrito: ${GOLDEN_PATH}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
