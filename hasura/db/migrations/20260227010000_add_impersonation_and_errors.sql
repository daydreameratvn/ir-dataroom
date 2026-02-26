-- migrate:up

-- ============================================================
-- Impersonation: user flag + session tracking
-- ============================================================

ALTER TABLE users ADD COLUMN is_impersonatable BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE auth_sessions ADD COLUMN impersonator_id UUID;
ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_impersonator_id_fkey
  FOREIGN KEY (impersonator_id) REFERENCES users(id);
CREATE INDEX idx_auth_sessions_impersonator_id
  ON auth_sessions (impersonator_id) WHERE impersonator_id IS NOT NULL;

-- ============================================================
-- Impersonation audit log
-- ============================================================

CREATE TABLE impersonation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id),

  tenant_id UUID NOT NULL REFERENCES tenants(id),
  impersonator_id UUID NOT NULL REFERENCES users(id),
  target_user_id UUID NOT NULL REFERENCES users(id),
  session_id UUID REFERENCES auth_sessions(id),
  action TEXT NOT NULL,          -- 'start' | 'end'
  ip_address TEXT,
  user_agent TEXT,
  reason TEXT,
  ended_at TIMESTAMPTZ
);

CREATE INDEX idx_impersonation_logs_tenant_id ON impersonation_logs (tenant_id);
CREATE INDEX idx_impersonation_logs_impersonator_id ON impersonation_logs (impersonator_id);
CREATE INDEX idx_impersonation_logs_target_user_id ON impersonation_logs (target_user_id);
CREATE INDEX idx_impersonation_logs_created_at ON impersonation_logs (created_at DESC);
CREATE INDEX idx_impersonation_logs_deleted_at ON impersonation_logs (deleted_at);

-- ============================================================
-- Error sources enum
-- ============================================================

CREATE TABLE error_sources (
  value TEXT PRIMARY KEY,
  comment TEXT
);

INSERT INTO error_sources (value, comment) VALUES
  ('frontend_boundary', 'React error boundary catch'),
  ('frontend_unhandled', 'Unhandled promise rejection or global error'),
  ('backend_unhandled', 'Backend unhandled exception'),
  ('backend_api', 'API route error response (4xx/5xx)'),
  ('agent', 'AI agent runtime error');

-- ============================================================
-- Error statuses enum
-- ============================================================

CREATE TABLE error_statuses (
  value TEXT PRIMARY KEY,
  comment TEXT
);

INSERT INTO error_statuses (value, comment) VALUES
  ('new', 'Newly reported, not yet reviewed'),
  ('acknowledged', 'Seen by a human'),
  ('auto_fix_pending', 'Claude Code is working on a fix'),
  ('auto_fix_pr_created', 'A fix PR has been created'),
  ('resolved', 'Fix has been deployed'),
  ('ignored', 'Marked as not worth fixing'),
  ('wont_fix', 'Intentional or external issue');

-- ============================================================
-- Error reports
-- ============================================================

CREATE TABLE error_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id),

  tenant_id UUID REFERENCES tenants(id),
  source TEXT NOT NULL REFERENCES error_sources(value),
  status TEXT NOT NULL DEFAULT 'new' REFERENCES error_statuses(value),
  severity TEXT NOT NULL DEFAULT 'error',

  message TEXT NOT NULL,
  stack_trace TEXT,
  component_stack TEXT,
  url TEXT,
  endpoint TEXT,

  user_id UUID REFERENCES users(id),
  impersonator_id UUID REFERENCES users(id),
  session_id UUID,
  request_id TEXT,
  user_agent TEXT,
  ip_address TEXT,

  metadata JSONB,

  fingerprint TEXT NOT NULL,
  occurrence_count INT NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  fix_pr_url TEXT,
  fix_pr_number INT,
  fix_branch TEXT,
  fix_attempted_at TIMESTAMPTZ,
  fix_completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_error_reports_fingerprint
  ON error_reports (fingerprint)
  WHERE deleted_at IS NULL AND status NOT IN ('resolved', 'ignored', 'wont_fix');
CREATE INDEX idx_error_reports_tenant_id ON error_reports (tenant_id);
CREATE INDEX idx_error_reports_source ON error_reports (source);
CREATE INDEX idx_error_reports_status ON error_reports (status);
CREATE INDEX idx_error_reports_severity ON error_reports (severity);
CREATE INDEX idx_error_reports_created_at ON error_reports (created_at DESC);
CREATE INDEX idx_error_reports_last_seen_at ON error_reports (last_seen_at DESC);
CREATE INDEX idx_error_reports_deleted_at ON error_reports (deleted_at);

-- migrate:down
