-- Up migration: Server Providers, MTA enhancements, Additional IPs, VMTAs, and Proxy Servers

-- 1. Server Providers table
CREATE TABLE IF NOT EXISTS server_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    port_25_open BOOLEAN NOT NULL DEFAULT false,
    website VARCHAR(255),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed standard cloud and dedicated providers
INSERT INTO server_providers (name, port_25_open, website, description) VALUES
    ('OVHcloud', true, 'https://www.ovhcloud.com', 'Dedicated & VPS. Outbound port 25 open by default on most bare-metal and classic instances.'),
    ('Contabo', true, 'https://contabo.com', 'High performance VPS/VDS. Outbound port 25 open by default with clean PTR capability.'),
    ('Scaleway', true, 'https://www.scaleway.com', 'European cloud provider. Outbound port 25 unblocked on Elastic Metal and standard VPS.'),
    ('Netcup', true, 'https://www.netcup.eu', 'Root servers and VPS. Port 25 open, ideal for MTA delivery pools.'),
    ('Hetzner', false, 'https://www.hetzner.com', 'Cloud servers have port 25 blocked by default for first month or until manual unblock request approved.'),
    ('DigitalOcean', false, 'https://www.digitalocean.com', 'Port 25 blocked by default on all new accounts to prevent spam abuse.'),
    ('Linode / Akamai', false, 'https://www.linode.com', 'Port 25 blocked by default; support ticket required with business justification.'),
    ('Vultr', false, 'https://www.vultr.com', 'Port 25 blocked by default; unblock requires KYC verification and support approval.'),
    ('AWS EC2', false, 'https://aws.amazon.com/ec2', 'Port 25 throttled/blocked by default; requires submitting AWS reverse DNS and port 25 removal request.')
ON CONFLICT (name) DO NOTHING;

-- 2. Enhance Servers table with MTA, Provider, and IP columns
ALTER TABLE servers ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES server_providers(id) ON DELETE SET NULL;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS server_type VARCHAR(32) NOT NULL DEFAULT 'mta';
ALTER TABLE servers ADD COLUMN IF NOT EXISTS port_25_status VARCHAR(32) NOT NULL DEFAULT 'unknown';
ALTER TABLE servers ADD COLUMN IF NOT EXISTS mta_installed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS mta_software VARCHAR(64) DEFAULT 'postfix';
ALTER TABLE servers ADD COLUMN IF NOT EXISTS main_ip VARCHAR(45);

-- 3. Additional Server IPs (detected or configured via nmcli)
CREATE TABLE IF NOT EXISTS server_ips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    ip_address VARCHAR(45) NOT NULL,
    subnet_cidr INT NOT NULL DEFAULT 32,
    gateway VARCHAR(45),
    interface_name VARCHAR(64) NOT NULL DEFAULT 'eth0',
    is_main BOOLEAN NOT NULL DEFAULT false,
    is_configured BOOLEAN NOT NULL DEFAULT false,
    rdns_hostname VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(server_id, ip_address)
);
CREATE INDEX IF NOT EXISTS idx_server_ips_server_id ON server_ips(server_id);
CREATE INDEX IF NOT EXISTS idx_server_ips_ip ON server_ips(ip_address);

-- 4. Virtual MTAs (VMTAs)
CREATE TABLE IF NOT EXISTS vmtas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    server_ip_id UUID REFERENCES server_ips(id) ON DELETE SET NULL,
    vmta_name VARCHAR(128) NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    domain_name VARCHAR(255),
    host_name VARCHAR(255),
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(server_id, vmta_name)
);
CREATE INDEX IF NOT EXISTS idx_vmtas_server_id ON vmtas(server_id);
CREATE INDEX IF NOT EXISTS idx_vmtas_domain ON vmtas(domain_name);

-- 5. Proxy Servers (Squid HTTP & Dante SOCKS5)
CREATE TABLE IF NOT EXISTS proxy_servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    http_proxy_enabled BOOLEAN NOT NULL DEFAULT false,
    http_proxy_port INT NOT NULL DEFAULT 3128,
    socks_proxy_enabled BOOLEAN NOT NULL DEFAULT false,
    socks_proxy_port INT NOT NULL DEFAULT 1080,
    auth_user VARCHAR(64) NOT NULL DEFAULT 'proxyuser',
    auth_password TEXT NOT NULL DEFAULT 'SecretProxyPass123!',
    status VARCHAR(32) NOT NULL DEFAULT 'stopped',
    last_checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(server_id)
);
CREATE INDEX IF NOT EXISTS idx_proxy_servers_server_id ON proxy_servers(server_id);

-- 6. Add role permissions for new resources
INSERT INTO role_permissions (role_name, resource, can_view, can_insert, can_update, can_delete) VALUES
    ('admin', 'server_providers', true, true, true, true),
    ('admin', 'vmtas',            true, true, true, true),
    ('admin', 'proxies',          true, true, true, true),
    ('operator', 'server_providers', true, true, true, false),
    ('operator', 'vmtas',            true, true, true, true),
    ('operator', 'proxies',          true, true, true, false),
    ('viewer', 'server_providers',   true, false, false, false),
    ('viewer', 'vmtas',              true, false, false, false),
    ('viewer', 'proxies',            true, false, false, false)
ON CONFLICT (role_name, resource) DO NOTHING;
