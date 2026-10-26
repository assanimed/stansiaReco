-- Up migration: Enhancements for domain providers and DNS record IP replacement

ALTER TABLE provider_integrations 
    ADD COLUMN IF NOT EXISTS encrypted_api_secret BYTEA,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

ALTER TABLE domains
    ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_dns_records_value ON dns_records(record_value);
CREATE INDEX IF NOT EXISTS idx_dns_records_host_type ON dns_records(domain_id, record_type, host_name);
