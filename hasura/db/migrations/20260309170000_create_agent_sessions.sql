-- migrate:up
-- Create agent_sessions and agent_session_events for persistent agent chat sessions.
-- Supports claim-submission and other interactive agents with full event logging,
-- message history for resumption, and debugging/troubleshooting.

CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  messages JSONB NOT NULL DEFAULT '[]',
  context JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  tenant_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID,
  deleted_by UUID
);

CREATE INDEX idx_agent_sessions_agent_type ON agent_sessions (agent_type);
CREATE INDEX idx_agent_sessions_status ON agent_sessions (status);
CREATE INDEX idx_agent_sessions_tenant_id ON agent_sessions (tenant_id);
CREATE INDEX idx_agent_sessions_created_at ON agent_sessions (created_at DESC);
CREATE INDEX idx_agent_sessions_deleted_at ON agent_sessions (deleted_at);

CREATE TABLE agent_session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES agent_sessions(id),
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  content TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  tenant_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID,
  deleted_by UUID
);

CREATE INDEX idx_agent_session_events_session_id ON agent_session_events (session_id);
CREATE INDEX idx_agent_session_events_deleted_at ON agent_session_events (deleted_at);
CREATE UNIQUE INDEX idx_agent_session_events_session_sequence ON agent_session_events (session_id, sequence);

-- migrate:down
DROP TABLE IF EXISTS agent_session_events;
DROP TABLE IF EXISTS agent_sessions;
