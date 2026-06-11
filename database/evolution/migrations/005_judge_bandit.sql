-- EPIS2 Evolab — Sprint 11: judge advisory + bandit UCB

ALTER TABLE evolution.findings ADD COLUMN IF NOT EXISTS judge_verdict TEXT
  CHECK (judge_verdict IS NULL OR judge_verdict IN ('signal', 'noise', 'duplicate'));
ALTER TABLE evolution.findings ADD COLUMN IF NOT EXISTS judge_confidence NUMERIC(4, 3);
ALTER TABLE evolution.findings ADD COLUMN IF NOT EXISTS judge_rationale TEXT;
ALTER TABLE evolution.findings ADD COLUMN IF NOT EXISTS judge_model TEXT;
ALTER TABLE evolution.findings ADD COLUMN IF NOT EXISTS judge_prompt_version TEXT;
ALTER TABLE evolution.findings ADD COLUMN IF NOT EXISTS judge_at TIMESTAMPTZ;
ALTER TABLE evolution.findings ADD COLUMN IF NOT EXISTS judge_priority INT;

CREATE INDEX IF NOT EXISTS idx_evolab_findings_judge_queue
  ON evolution.findings (review_status, judge_verdict, severity, judge_priority NULLS LAST);

CREATE TABLE IF NOT EXISTS evolution.model_bandit_stats (
  task_type TEXT NOT NULL CHECK (task_type IN (
    'mutate_amplitude', 'mutate_repair', 'mutate_depth',
    'judge_triage', 'scenario_authoring'
  )),
  model_name TEXT NOT NULL,
  pulls INT NOT NULL DEFAULT 0,
  total_reward NUMERIC(12, 6) NOT NULL DEFAULT 0,
  last_reward NUMERIC(6, 4),
  last_selected_at TIMESTAMPTZ,
  warm_start_source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_type, model_name)
);

CREATE INDEX IF NOT EXISTS idx_bandit_task_pulls
  ON evolution.model_bandit_stats (task_type, pulls);

CREATE TABLE IF NOT EXISTS evolution.model_bandit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type TEXT NOT NULL,
  model_name TEXT NOT NULL,
  reward NUMERIC(6, 4) NOT NULL CHECK (reward >= 0 AND reward <= 1),
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON evolution.model_bandit_stats TO epis2_evolab;
GRANT SELECT, INSERT, UPDATE, DELETE ON evolution.model_bandit_events TO epis2_evolab;

UPDATE evolution.schema_meta SET version = 'evolab-v1-judge-bandit', applied_at = NOW() WHERE id = 1;
