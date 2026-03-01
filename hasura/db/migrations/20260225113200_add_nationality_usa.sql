-- migrate:up
INSERT INTO nationalities (value, comment) VALUES ('US', 'United States') ON CONFLICT (value) DO NOTHING;

-- migrate:down
-- no rollback, write a new migration instead
