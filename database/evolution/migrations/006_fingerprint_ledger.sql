-- EPIS2 Evolab — Sprint 14: fingerprint ledger + dedup evolve

ALTER TABLE evolution.findings ADD COLUMN IF NOT EXISTS structural_signature TEXT;

CREATE INDEX IF NOT EXISTS idx_evolab_findings_struct_open_signal
  ON evolution.findings (structural_signature, review_status, judge_verdict)
  WHERE review_status = 'open' AND judge_verdict = 'signal';

CREATE OR REPLACE VIEW evolution.fingerprint_ledger AS
SELECT
  fingerprint,
  judge_verdict,
  review_status,
  COUNT(*)::int AS finding_count,
  COUNT(*) FILTER (WHERE review_status = 'open')::int AS open_count,
  COUNT(DISTINCT scenario_id)::int AS scenario_count,
  COUNT(DISTINCT structural_signature) FILTER (WHERE structural_signature IS NOT NULL)::int AS structural_variants,
  MAX(severity) AS max_severity,
  MAX(created_at) AS last_seen_at
FROM evolution.findings
GROUP BY fingerprint, judge_verdict, review_status;

GRANT SELECT ON evolution.fingerprint_ledger TO epis2_evolab;

UPDATE evolution.schema_meta SET version = 'evolab-v1-fingerprint-ledger', applied_at = NOW() WHERE id = 1;
