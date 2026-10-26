-- Down migration: Revert domain providers and DNS enhancements

DROP INDEX IF EXISTS idx_dns_records_host_type;
DROP INDEX IF EXISTS idx_dns_records_value;
ALTER TABLE domains DROP COLUMN IF EXISTS notes;
ALTER TABLE provider_integrations DROP COLUMN IF EXISTS metadata;
ALTER TABLE provider_integrations DROP COLUMN IF EXISTS notes;
ALTER TABLE provider_integrations DROP COLUMN IF EXISTS encrypted_api_secret;
