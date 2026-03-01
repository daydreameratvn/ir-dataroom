-- migrate:up
INSERT INTO nationalities (value, comment) VALUES ('US', 'United States');

-- migrate:down
-- no rollback, write a new migration instead
