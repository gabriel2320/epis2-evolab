-- EPIS2 Evolab — schema evolution (DB epis2_evolab)

CREATE SCHEMA IF NOT EXISTS evolution;

CREATE TABLE IF NOT EXISTS evolution.schema_meta (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO evolution.schema_meta (id, version)
VALUES (1, 'evolab-v1-init')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS evolution.runs (
  id UUID PRIMARY KEY,
  scenario_id TEXT NOT NULL,
  scenario_version INT NOT NULL,
  target_environment_id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  status TEXT NOT NULL,
  random_seed TEXT NOT NULL,
  commit_sha TEXT,
  branch TEXT,
  model_name TEXT,
  model_profile TEXT,
  prompt_version TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  configuration JSONB,
  evidence_dir TEXT,
  final_status TEXT,
  finding_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evolab_runs_scenario ON evolution.runs (scenario_id);
CREATE INDEX IF NOT EXISTS idx_evolab_runs_status ON evolution.runs (final_status);
CREATE INDEX IF NOT EXISTS idx_evolab_runs_started ON evolution.runs (started_at DESC);

CREATE TABLE IF NOT EXISTS evolution.evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES evolution.runs (id) ON DELETE CASCADE,
  evaluator_id TEXT NOT NULL,
  passed BOOLEAN NOT NULL,
  severity TEXT,
  message TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evolab_evaluations_run ON evolution.evaluations (run_id);

CREATE TABLE IF NOT EXISTS evolution.findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES evolution.runs (id) ON DELETE CASCADE,
  scenario_id TEXT NOT NULL,
  target_environment_id TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  confidence NUMERIC(4, 3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  title TEXT NOT NULL,
  expected_result TEXT NOT NULL,
  actual_result TEXT NOT NULL,
  reproducible BOOLEAN NOT NULL DEFAULT TRUE,
  evidence_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_components JSONB NOT NULL DEFAULT '[]'::jsonb,
  fingerprint TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'open' CHECK (review_status IN ('open', 'approved', 'rejected', 'duplicate')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evolab_findings_run ON evolution.findings (run_id);
CREATE INDEX IF NOT EXISTS idx_evolab_findings_fingerprint ON evolution.findings (fingerprint);
CREATE INDEX IF NOT EXISTS idx_evolab_findings_review ON evolution.findings (review_status, severity);

CREATE TABLE IF NOT EXISTS evolution.human_decisions (
  decision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES evolution.runs (id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  decision TEXT NOT NULL,
  comment TEXT,
  previous_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evolab_decisions_run ON evolution.human_decisions (run_id);

GRANT USAGE ON SCHEMA evolution TO epis2_evolab;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA evolution TO epis2_evolab;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA evolution TO epis2_evolab;

ALTER DEFAULT PRIVILEGES IN SCHEMA evolution
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO epis2_evolab;
ALTER DEFAULT PRIVILEGES IN SCHEMA evolution
  GRANT USAGE, SELECT ON SEQUENCES TO epis2_evolab;

UPDATE evolution.schema_meta SET version = 'evolab-v1-schema', applied_at = NOW() WHERE id = 1;
