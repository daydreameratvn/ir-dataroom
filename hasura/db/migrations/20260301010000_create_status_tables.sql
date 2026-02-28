-- migrate:up

-- ── Enum tables ──

CREATE TABLE incident_severities (
  value TEXT PRIMARY KEY
);
INSERT INTO incident_severities (value) VALUES ('minor'), ('major'), ('critical');

CREATE TABLE incident_statuses (
  value TEXT PRIMARY KEY
);
INSERT INTO incident_statuses (value) VALUES ('investigating'), ('identified'), ('monitoring'), ('resolved');

-- ── Status Incidents ──

CREATE TABLE status_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL REFERENCES incident_severities(value),
  status TEXT NOT NULL DEFAULT 'investigating' REFERENCES incident_statuses(value),
  affected_services TEXT[] NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id)
);

CREATE INDEX idx_status_incidents_status ON status_incidents (status) WHERE deleted_at IS NULL;
CREATE INDEX idx_status_incidents_started_at ON status_incidents (started_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_status_incidents_deleted_at ON status_incidents (deleted_at);

-- ── Status Incident Updates ──

CREATE TABLE status_incident_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES status_incidents(id),
  status TEXT NOT NULL REFERENCES incident_statuses(value),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id)
);

CREATE INDEX idx_status_incident_updates_incident ON status_incident_updates (incident_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_status_incident_updates_deleted_at ON status_incident_updates (deleted_at);

-- ── Status Snapshots ──

CREATE TABLE status_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  services JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id)
);

CREATE INDEX idx_status_snapshots_checked_at ON status_snapshots (checked_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_status_snapshots_deleted_at ON status_snapshots (deleted_at);

-- ── Status Service Overrides ──

CREATE TABLE status_service_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id)
);

-- Only one active (non-deleted) override per service where ends_at is open-ended
-- Expiration is enforced at application level; this prevents duplicate open overrides
CREATE UNIQUE INDEX idx_status_service_overrides_active
  ON status_service_overrides (service_name)
  WHERE deleted_at IS NULL AND ends_at IS NULL;

CREATE INDEX idx_status_service_overrides_deleted_at ON status_service_overrides (deleted_at);

-- migrate:down

DROP TABLE IF EXISTS status_service_overrides;
DROP TABLE IF EXISTS status_snapshots;
DROP TABLE IF EXISTS status_incident_updates;
DROP TABLE IF EXISTS status_incidents;
DROP TABLE IF EXISTS incident_statuses;
DROP TABLE IF EXISTS incident_severities;
