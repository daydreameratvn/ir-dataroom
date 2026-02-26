-- migrate:up

-- Table: agent_sessions
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  tenant_id UUID NOT NULL,
  agent_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  trigger_type TEXT NOT NULL DEFAULT 'automatic',
  triggered_by UUID,
  claim_id UUID,
  policy_id UUID,
  input_summary TEXT,
  output_summary TEXT,
  result TEXT,
  recommendation TEXT,
  error TEXT,
  duration_ms INT,
  tokens_used INT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT agent_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT agent_sessions_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT agent_sessions_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT agent_sessions_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX idx_agent_sessions_tenant_id ON agent_sessions (tenant_id);
CREATE INDEX idx_agent_sessions_agent_type ON agent_sessions (agent_type);
CREATE INDEX idx_agent_sessions_status ON agent_sessions (status);
CREATE INDEX idx_agent_sessions_claim_id ON agent_sessions (claim_id);
CREATE INDEX idx_agent_sessions_created_at ON agent_sessions (created_at DESC);
CREATE INDEX idx_agent_sessions_deleted_at ON agent_sessions (deleted_at);

-- Table: agent_actions
CREATE TABLE agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  session_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  action_name TEXT NOT NULL,
  input_text TEXT,
  output_text TEXT,
  result_text TEXT,
  duration_ms INT,
  sequence_number INT NOT NULL DEFAULT 0,
  CONSTRAINT agent_actions_session_id_fkey FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT agent_actions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX idx_agent_actions_session_id ON agent_actions (session_id);
CREATE INDEX idx_agent_actions_tenant_id ON agent_actions (tenant_id);
CREATE INDEX idx_agent_actions_created_at ON agent_actions (created_at DESC);
CREATE INDEX idx_agent_actions_deleted_at ON agent_actions (deleted_at);

-- Table: audit_logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  tenant_id UUID NOT NULL,
  user_id UUID,
  agent_session_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  ip_address TEXT,
  user_agent TEXT,
  CONSTRAINT audit_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT audit_logs_agent_session_id_fkey FOREIGN KEY (agent_session_id) REFERENCES agent_sessions(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX idx_audit_logs_tenant_id ON audit_logs (tenant_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_entity_type_entity_id ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs (action);
CREATE INDEX idx_audit_logs_deleted_at ON audit_logs (deleted_at);

-- Table: audit_log_entries (replaces JSONB changes column — typed field-level diffs)
CREATE TABLE audit_log_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  audit_log_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  CONSTRAINT audit_log_entries_audit_log_id_fkey FOREIGN KEY (audit_log_id) REFERENCES audit_logs(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT audit_log_entries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX idx_audit_log_entries_audit_log_id ON audit_log_entries (audit_log_id);
CREATE INDEX idx_audit_log_entries_tenant_id ON audit_log_entries (tenant_id);
CREATE INDEX idx_audit_log_entries_deleted_at ON audit_log_entries (deleted_at);

-- migrate:down
-- no rollback, write a new migration instead
