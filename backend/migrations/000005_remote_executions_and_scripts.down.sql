-- Down migration: Revert remote execution and script registry enhancements

ALTER TABLE execution_jobs
    DROP COLUMN IF EXISTS duration_ms,
    DROP COLUMN IF EXISTS script_name,
    DROP COLUMN IF EXISTS command_text,
    DROP COLUMN IF EXISTS execution_type,
    DROP COLUMN IF EXISTS server_host,
    DROP COLUMN IF EXISTS server_name;

ALTER TABLE script_registry
    DROP COLUMN IF EXISTS os_target,
    DROP COLUMN IF EXISTS category;
