-- Up migration: Initial schema for StansiaReco

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'operator', -- 'admin', 'operator'
    full_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Sessions
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- 3. Provider Integrations (Namecheap)
CREATE TABLE IF NOT EXISTS provider_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_type VARCHAR(64) NOT NULL, -- 'namecheap'
    name VARCHAR(255) NOT NULL,
    api_user VARCHAR(255) NOT NULL,
    account_user VARCHAR(255) NOT NULL,
    encrypted_api_key BYTEA NOT NULL,
    key_version INT NOT NULL DEFAULT 1,
    client_ip VARCHAR(45) NOT NULL,
    environment VARCHAR(32) NOT NULL DEFAULT 'sandbox', -- 'sandbox', 'production'
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_synced_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Domains
CREATE TABLE IF NOT EXISTS domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID REFERENCES provider_integrations(id) ON DELETE SET NULL,
    domain_name VARCHAR(255) NOT NULL UNIQUE,
    provider_domain_id VARCHAR(128),
    is_locked BOOLEAN NOT NULL DEFAULT false,
    auto_renew BOOLEAN NOT NULL DEFAULT false,
    uses_namecheap_dns BOOLEAN NOT NULL DEFAULT true,
    nameservers TEXT[] NOT NULL DEFAULT '{}',
    status VARCHAR(64) NOT NULL DEFAULT 'active', -- 'active', 'expired', 'sync_error'
    expires_at TIMESTAMPTZ,
    provider_created_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_domains_domain_name ON domains(domain_name);
CREATE INDEX IF NOT EXISTS idx_domains_status ON domains(status);

-- 5. DNS Records
CREATE TABLE IF NOT EXISTS dns_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    record_type VARCHAR(16) NOT NULL, -- 'A', 'AAAA', 'CNAME', 'MX', 'TXT', etc.
    host_name VARCHAR(255) NOT NULL,
    record_value TEXT NOT NULL,
    ttl INT NOT NULL DEFAULT 1800,
    mx_priority INT,
    is_managed BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dns_records_domain_id ON dns_records(domain_id);

-- 6. Credentials
CREATE TABLE IF NOT EXISTS credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    cred_type VARCHAR(32) NOT NULL, -- 'password', 'private_key', 'private_key_passphrase'
    username VARCHAR(128) NOT NULL,
    encrypted_secret BYTEA NOT NULL,
    key_version INT NOT NULL DEFAULT 1,
    fingerprint VARCHAR(128),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Servers
CREATE TABLE IF NOT EXISTS servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    hostname_or_ip VARCHAR(255) NOT NULL,
    ssh_port INT NOT NULL DEFAULT 22,
    os_info VARCHAR(128),
    environment VARCHAR(32) NOT NULL DEFAULT 'dev', -- 'dev', 'staging', 'prod', 'email', 'dns'
    tags TEXT[] NOT NULL DEFAULT '{}',
    description TEXT,
    credential_id UUID REFERENCES credentials(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    allow_private_ip BOOLEAN NOT NULL DEFAULT false,
    pinned_host_key TEXT,
    last_tested_at TIMESTAMPTZ,
    last_test_status VARCHAR(32), -- 'success', 'failed'
    last_test_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_servers_environment ON servers(environment);
CREATE INDEX IF NOT EXISTS idx_servers_hostname ON servers(hostname_or_ip);

-- 8. Script Registry
CREATE TABLE IF NOT EXISTS script_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    script_content TEXT NOT NULL,
    allowed_parameters JSONB NOT NULL DEFAULT '[]',
    timeout_seconds INT NOT NULL DEFAULT 60,
    is_dangerous BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Execution Jobs
CREATE TABLE IF NOT EXISTS execution_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    requested_by_user_id UUID NOT NULL REFERENCES users(id),
    script_slug VARCHAR(64) NOT NULL REFERENCES script_registry(slug),
    parameters JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(32) NOT NULL DEFAULT 'pending', -- 'pending', 'queued', 'running', 'success', 'failed', 'cancelled'
    exit_code INT,
    stdout TEXT,
    stderr TEXT,
    stdout_truncated BOOLEAN NOT NULL DEFAULT false,
    stderr_truncated BOOLEAN NOT NULL DEFAULT false,
    error_message TEXT,
    queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    heartbeat_at TIMESTAMPTZ,
    worker_id VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_execution_jobs_status ON execution_jobs(status);
CREATE INDEX IF NOT EXISTS idx_execution_jobs_server_id ON execution_jobs(server_id);
CREATE INDEX IF NOT EXISTS idx_execution_jobs_queued_at ON execution_jobs(queued_at);

-- 10. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(64) NOT NULL,
    resource_type VARCHAR(64) NOT NULL,
    resource_id VARCHAR(128),
    details JSONB NOT NULL DEFAULT '{}',
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
