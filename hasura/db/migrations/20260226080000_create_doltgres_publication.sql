-- migrate:up

-- ============================================================
-- Replication Role for Doltgres Logical Subscriber
-- ============================================================
-- Password is managed by Pulumi (Secrets Manager) and set via
-- ALTER ROLE after this migration runs.

CREATE ROLE doltgres_replicator WITH LOGIN REPLICATION PASSWORD 'PLACEHOLDER_SET_BY_PULUMI';

GRANT CONNECT ON DATABASE banyan TO doltgres_replicator;
GRANT USAGE ON SCHEMA public TO doltgres_replicator;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO doltgres_replicator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO doltgres_replicator;

-- ============================================================
-- Publication for Doltgres Logical Replication
-- ============================================================

CREATE PUBLICATION doltgres_pub FOR ALL TABLES;

-- migrate:down
-- Intentionally left empty — replication roles and publications
-- should not be automatically dropped.
