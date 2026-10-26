-- Up migration: iRedMail Server Deployments & Automated DNS Pipeline

CREATE TABLE IF NOT EXISTS iredmail_servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE RESTRICT,
    hostname VARCHAR(255) NOT NULL,
    mail_domain VARCHAR(255) NOT NULL,
    admin_email VARCHAR(255) NOT NULL,
    encrypted_admin_password BYTEA,
    os_name VARCHAR(128) NOT NULL DEFAULT '',
    os_version VARCHAR(64) NOT NULL DEFAULT '',
    container_name VARCHAR(128) NOT NULL DEFAULT 'iredmail',
    container_id VARCHAR(128) NOT NULL DEFAULT '',
    dkim_selector VARCHAR(128) NOT NULL DEFAULT 'dkim',
    dkim_host VARCHAR(255) NOT NULL DEFAULT 'dkim._domainkey',
    dkim_value TEXT NOT NULL DEFAULT '',
    dkim_raw_output TEXT NOT NULL DEFAULT '',
    dns_a_configured BOOLEAN NOT NULL DEFAULT false,
    dns_mx_configured BOOLEAN NOT NULL DEFAULT false,
    dns_spf_configured BOOLEAN NOT NULL DEFAULT false,
    dns_dmarc_configured BOOLEAN NOT NULL DEFAULT false,
    dns_dkim_configured BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    current_step VARCHAR(64) NOT NULL DEFAULT 'os_check',
    pipeline_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    error_message TEXT NOT NULL DEFAULT '',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iredmail_servers_server_id ON iredmail_servers(server_id);
CREATE INDEX IF NOT EXISTS idx_iredmail_servers_domain_id ON iredmail_servers(domain_id);
CREATE INDEX IF NOT EXISTS idx_iredmail_servers_status ON iredmail_servers(status);
CREATE INDEX IF NOT EXISTS idx_iredmail_servers_created_at ON iredmail_servers(created_at DESC);
