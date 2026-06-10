-- EPIS2 Evolab — Sprint 7: fitness y mapa de cobertura por run

CREATE TABLE IF NOT EXISTS evolution.scenario_fitness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id TEXT NOT NULL,
  run_id UUID NOT NULL REFERENCES evolution.runs (id) ON DELETE CASCADE,
  endpoints_covered JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_events_covered JSONB NOT NULL DEFAULT '[]'::jsonb,
  findings_count INT NOT NULL DEFAULT 0,
  duration_ms INT NOT NULL DEFAULT 0,
  novelty REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evolab_fitness_scenario
  ON evolution.scenario_fitness (scenario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evolab_fitness_run ON evolution.scenario_fitness (run_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON evolution.scenario_fitness TO epis2_evolab;

UPDATE evolution.schema_meta SET version = 'evolab-v2-fitness', applied_at = NOW() WHERE id = 1;
