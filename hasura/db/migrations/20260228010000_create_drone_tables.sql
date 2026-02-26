-- migrate:up

-- =============================================================================
-- Table: drone_runs
-- Records each Drone batch execution (manual, scheduled, or single claim)
-- =============================================================================
CREATE TABLE drone_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  -- Run metadata
  run_type TEXT NOT NULL DEFAULT 'manual',      -- manual | scheduled | single
  tier INT NOT NULL DEFAULT 1,                  -- 1 or 2
  status TEXT NOT NULL DEFAULT 'pending',       -- pending | running | completed | failed | cancelled
  triggered_by UUID REFERENCES users(id),
  schedule_id UUID,                             -- FK added after drone_schedules table

  -- Configuration
  batch_size INT NOT NULL DEFAULT 5,

  -- Progress tracking
  total_claims INT NOT NULL DEFAULT 0,
  processed_count INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  denied_count INT NOT NULL DEFAULT 0,
  error_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INT
);

CREATE INDEX idx_drone_runs_tenant_id ON drone_runs (tenant_id);
CREATE INDEX idx_drone_runs_status ON drone_runs (status);
CREATE INDEX idx_drone_runs_run_type ON drone_runs (run_type);
CREATE INDEX idx_drone_runs_created_at ON drone_runs (created_at DESC);
CREATE INDEX idx_drone_runs_deleted_at ON drone_runs (deleted_at);

-- =============================================================================
-- Table: drone_run_results
-- Records the result of each individual claim processed in a drone run
-- =============================================================================
CREATE TABLE drone_run_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  run_id UUID NOT NULL REFERENCES drone_runs(id),
  claim_code TEXT NOT NULL,
  claim_case_id TEXT,                           -- Apple's UUID stored as text (no cross-DB FK)
  tier INT NOT NULL DEFAULT 1,

  -- Result
  status TEXT NOT NULL,                         -- success | denied | error | skipped
  message TEXT,

  -- Financial data (cached from drone output for dashboard display)
  request_amount NUMERIC,
  paid_amount NUMERIC,
  non_paid_amount NUMERIC,

  -- Tool tracking
  tools_called TEXT[] DEFAULT '{}',
  tool_call_count INT DEFAULT 0,

  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INT
);

CREATE INDEX idx_drone_run_results_run_id ON drone_run_results (run_id);
CREATE INDEX idx_drone_run_results_tenant_id ON drone_run_results (tenant_id);
CREATE INDEX idx_drone_run_results_claim_code ON drone_run_results (claim_code);
CREATE INDEX idx_drone_run_results_status ON drone_run_results (status);
CREATE INDEX idx_drone_run_results_created_at ON drone_run_results (created_at DESC);
CREATE INDEX idx_drone_run_results_deleted_at ON drone_run_results (deleted_at);

-- =============================================================================
-- Table: drone_schedules
-- Defines automated drone schedule configurations
-- =============================================================================
CREATE TABLE drone_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  -- Schedule config
  name TEXT NOT NULL,
  description TEXT,
  tier INT NOT NULL DEFAULT 1,
  batch_size INT NOT NULL DEFAULT 10,
  cron_expression TEXT NOT NULL,                -- e.g. '0 9 * * 1-5' (9am weekdays)
  timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  enabled BOOLEAN NOT NULL DEFAULT true,

  -- Notification settings
  slack_channel TEXT,

  -- Last execution tracking
  last_run_id UUID REFERENCES drone_runs(id),
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ
);

CREATE INDEX idx_drone_schedules_tenant_id ON drone_schedules (tenant_id);
CREATE INDEX idx_drone_schedules_enabled ON drone_schedules (enabled) WHERE deleted_at IS NULL;
CREATE INDEX idx_drone_schedules_next_run_at ON drone_schedules (next_run_at);
CREATE INDEX idx_drone_schedules_deleted_at ON drone_schedules (deleted_at);

-- Add FK from drone_runs.schedule_id to drone_schedules
ALTER TABLE drone_runs ADD CONSTRAINT drone_runs_schedule_id_fkey
  FOREIGN KEY (schedule_id) REFERENCES drone_schedules(id);
CREATE INDEX idx_drone_runs_schedule_id ON drone_runs (schedule_id);

-- migrate:down
-- no rollback, write a new migration instead
