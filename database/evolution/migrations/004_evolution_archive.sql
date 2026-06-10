-- EPIS2 Evolab — Sprint 9: archivo evolutivo MAP-Elites (candidatos, élites, históricos)

CREATE TABLE IF NOT EXISTS evolution.evolution_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id TEXT NOT NULL,
  scenario_yaml TEXT NOT NULL,
  niche JSONB NOT NULL,
  niche_key TEXT NOT NULL,
  fitness JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'candidate'
    CHECK (status IN ('candidate', 'elite', 'promoted', 'discarded')),
  discard_reason TEXT,
  parent_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  operator TEXT,
  generation INT NOT NULL DEFAULT 0,
  -- Sin FK a evolution.runs: un candidato puede fallar antes de persistir su run.
  run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evolab_archive_niche_status
  ON evolution.evolution_archive (niche_key, status);
CREATE INDEX IF NOT EXISTS idx_evolab_archive_candidate
  ON evolution.evolution_archive (candidate_id);
CREATE INDEX IF NOT EXISTS idx_evolab_archive_status
  ON evolution.evolution_archive (status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON evolution.evolution_archive TO epis2_evolab;

UPDATE evolution.schema_meta SET version = 'evolab-v3-archive', applied_at = NOW() WHERE id = 1;
