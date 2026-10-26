-- Up migration: Mail List Management, Contacts, Mailbox Providers, ESPs, IP Pools, and Suppressions

-- 1. Mailbox Providers (e.g. Gmail, Yahoo Mail, Outlook.com, etc.)
CREATE TABLE IF NOT EXISTS mailbox_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    code VARCHAR(64) NOT NULL UNIQUE,
    domains TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mailbox_providers_code ON mailbox_providers(code);
CREATE INDEX IF NOT EXISTS idx_mailbox_providers_active ON mailbox_providers(is_active);

-- 2. Sending ESPs (e.g. Amazon SES, SendGrid, SparkPost, Custom PowerMTA)
CREATE TABLE IF NOT EXISTS sending_esps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL UNIQUE,
    code VARCHAR(64) NOT NULL UNIQUE,
    api_type VARCHAR(64) NOT NULL DEFAULT 'smtp', -- 'smtp', 'api', 'powermta'
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Sending IP Pools
CREATE TABLE IF NOT EXISTS sending_ip_pools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL UNIQUE,
    code VARCHAR(64) NOT NULL UNIQUE,
    description TEXT,
    server_id UUID REFERENCES servers(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sending_ip_pool_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id UUID NOT NULL REFERENCES sending_ip_pools(id) ON DELETE CASCADE,
    ip_address VARCHAR(45) NOT NULL,
    server_ip_id UUID REFERENCES server_ips(id) ON DELETE SET NULL,
    vmta_name VARCHAR(128),
    weight INT NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(pool_id, ip_address)
);
CREATE INDEX IF NOT EXISTS idx_pool_members_pool_id ON sending_ip_pool_members(pool_id);

-- 4. Countries (ISO 3166-1 alpha-2)
CREATE TABLE IF NOT EXISTS countries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(2) NOT NULL UNIQUE,
    name VARCHAR(128) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_countries_code ON countries(code);

-- 5. Verticals (Business categories: Retail, Travel, Finance, etc.)
CREATE TABLE IF NOT EXISTS verticals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    code VARCHAR(64) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_verticals_code ON verticals(code);

-- 6. Mail Lists
CREATE TABLE IF NOT EXISTS mail_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(128) NOT NULL UNIQUE,
    mailbox_provider_id UUID NOT NULL REFERENCES mailbox_providers(id) ON DELETE RESTRICT,
    country_id UUID NOT NULL REFERENCES countries(id) ON DELETE RESTRICT,
    vertical_id UUID NOT NULL REFERENCES verticals(id) ON DELETE RESTRICT,
    description TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'active', -- 'active', 'paused', 'archived'
    contact_count BIGINT NOT NULL DEFAULT 0,
    last_imported_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_mail_lists_provider_country_vertical_name UNIQUE (mailbox_provider_id, country_id, vertical_id, name)
);
CREATE INDEX IF NOT EXISTS idx_mail_lists_status ON mail_lists(status);
CREATE INDEX IF NOT EXISTS idx_mail_lists_provider ON mail_lists(mailbox_provider_id);
CREATE INDEX IF NOT EXISTS idx_mail_lists_country ON mail_lists(country_id);
CREATE INDEX IF NOT EXISTS idx_mail_lists_vertical ON mail_lists(vertical_id);

-- 7. Contacts
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES mail_lists(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    email_md5 VARCHAR(32) NOT NULL,
    first_name VARCHAR(128),
    last_name VARCHAR(128),
    verticals TEXT[] NOT NULL DEFAULT '{}',
    is_seed BOOLEAN NOT NULL DEFAULT false,
    is_fresh BOOLEAN NOT NULL DEFAULT true,
    is_clean BOOLEAN NOT NULL DEFAULT true,
    is_opener BOOLEAN NOT NULL DEFAULT false,
    is_clicker BOOLEAN NOT NULL DEFAULT false,
    is_leader BOOLEAN NOT NULL DEFAULT false,
    is_unsub BOOLEAN NOT NULL DEFAULT false,
    is_optout BOOLEAN NOT NULL DEFAULT false,
    is_blacklisted BOOLEAN NOT NULL DEFAULT false,
    is_hard_bounced BOOLEAN NOT NULL DEFAULT false,
    last_action_time TIMESTAMPTZ,
    last_action_type VARCHAR(64),
    agent TEXT,
    ip INET,
    country_code VARCHAR(2),
    country VARCHAR(128),
    region VARCHAR(128),
    city VARCHAR(128),
    language VARCHAR(32),
    device_type VARCHAR(64),
    device_name VARCHAR(128),
    os VARCHAR(64),
    browser_name VARCHAR(64),
    browser_version VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_contacts_list_email UNIQUE (list_id, email)
);
CREATE INDEX IF NOT EXISTS idx_contacts_list_id ON contacts(list_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_email_md5 ON contacts(email_md5);
CREATE INDEX IF NOT EXISTS idx_contacts_list_status ON contacts(list_id, is_clean, is_unsub, is_optout, is_blacklisted, is_hard_bounced);

-- 8. Suppressions (Unsubscribes, opt-outs, blacklists, hard bounces)
CREATE TABLE IF NOT EXISTS suppressions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    email_md5 VARCHAR(32) NOT NULL,
    reason VARCHAR(64) NOT NULL DEFAULT 'unsubscribed', -- 'unsubscribed', 'optout', 'blacklisted', 'hard_bounce', 'manual'
    source VARCHAR(255) NOT NULL DEFAULT 'manual', -- 'import', 'campaign_bounce', 'manual', 'api'
    details TEXT,
    list_id UUID REFERENCES mail_lists(id) ON DELETE SET NULL, -- NULL denotes global suppression across all lists
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_suppressions_scope_email UNIQUE NULLS NOT DISTINCT (email, list_id)
);
CREATE INDEX IF NOT EXISTS idx_suppressions_email ON suppressions(email);
CREATE INDEX IF NOT EXISTS idx_suppressions_email_md5 ON suppressions(email_md5);
CREATE INDEX IF NOT EXISTS idx_suppressions_reason ON suppressions(reason);

-- 9. Import Jobs
CREATE TABLE IF NOT EXISTS import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES mail_lists(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id),
    filename VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL DEFAULT '',
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'pending', -- 'pending', 'validating', 'queued', 'processing', 'completed', 'completed_with_errors', 'failed', 'cancelled'
    column_mapping JSONB NOT NULL DEFAULT '{}',
    duplicate_strategy VARCHAR(32) NOT NULL DEFAULT 'skip', -- 'skip', 'update', 'replace'
    total_rows INT NOT NULL DEFAULT 0,
    processed_rows INT NOT NULL DEFAULT 0,
    accepted_rows INT NOT NULL DEFAULT 0,
    inserted_rows INT NOT NULL DEFAULT 0,
    updated_rows INT NOT NULL DEFAULT 0,
    duplicate_rows INT NOT NULL DEFAULT 0,
    invalid_rows INT NOT NULL DEFAULT 0,
    suppressed_rows INT NOT NULL DEFAULT 0,
    error_count INT NOT NULL DEFAULT 0,
    error_report JSONB NOT NULL DEFAULT '[]',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_import_jobs_list_id ON import_jobs(list_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status);

-- 10. Contact Events (Activity & Engagement History)
CREATE TABLE IF NOT EXISTS contact_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    list_id UUID NOT NULL REFERENCES mail_lists(id) ON DELETE CASCADE,
    event_type VARCHAR(64) NOT NULL, -- 'import', 'open', 'click', 'bounce', 'unsubscribe', 'optout', 'suppressed'
    email VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contact_events_list_created ON contact_events(list_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_events_email ON contact_events(email);

-- 11. Data Settings
CREATE TABLE IF NOT EXISTS data_settings (
    setting_key VARCHAR(128) PRIMARY KEY,
    setting_value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed initial data settings
INSERT INTO data_settings (setting_key, setting_value, description) VALUES
    ('import_limits', '{"max_file_size_mb": 100, "max_rows_per_job": 1000000, "concurrent_jobs": 3}'::jsonb, 'CSV import upload and row processing constraints'),
    ('normalization_rules', '{"lowercase_email": true, "trim_whitespace": true, "preserve_plus_tags": true, "strip_control_chars": true}'::jsonb, 'Contact email address cleaning policies'),
    ('suppression_rules', '{"auto_suppress_hard_bounces": true, "global_suppressions_take_precedence": true}'::jsonb, 'Sending compliance and suppression rules')
ON CONFLICT (setting_key) DO NOTHING;

-- Seed Starter Catalog of Mailbox Providers (26 requested providers)
INSERT INTO mailbox_providers (name, code, domains, is_active, description) VALUES
    ('Gmail', 'gmail', ARRAY['gmail.com', 'googlemail.com'], true, 'Google Workspace & Consumer Gmail accounts'),
    ('Yahoo Mail', 'yahoo', ARRAY['yahoo.com', 'ymail.com', 'rocketmail.com', 'yahoo.co.uk'], true, 'Yahoo Consumer & Business Mail'),
    ('Outlook.com', 'outlook', ARRAY['outlook.com'], true, 'Microsoft Modern Consumer Mailbox'),
    ('Hotmail', 'hotmail', ARRAY['hotmail.com', 'hotmail.co.uk', 'hotmail.fr'], true, 'Microsoft Legacy Hotmail Service'),
    ('Microsoft Live', 'live', ARRAY['live.com', 'live.co.uk', 'live.fr'], true, 'Windows Live Mail Services'),
    ('iCloud', 'icloud', ARRAY['icloud.com', 'me.com', 'mac.com'], true, 'Apple iCloud Consumer Mail'),
    ('AOL Mail', 'aol', ARRAY['aol.com', 'aim.com'], true, 'AOL Consumer Mail Services'),
    ('Proton Mail', 'proton', ARRAY['proton.me', 'protonmail.com'], true, 'End-to-end encrypted Swiss mailbox provider'),
    ('GMX', 'gmx', ARRAY['gmx.net', 'gmx.de', 'gmx.com'], true, 'Global Mail Exchange (1&1 Mail & Media)'),
    ('mail.com', 'mailcom', ARRAY['mail.com', 'email.com'], true, '1&1 Mail & Media multi-domain portal'),
    ('Fastmail', 'fastmail', ARRAY['fastmail.com', 'fastmail.fm'], true, 'Independent Australian email provider'),
    ('Tuta', 'tuta', ARRAY['tuta.com', 'tutanota.com'], true, 'Encrypted privacy-first German email provider'),
    ('Zoho Mail', 'zoho', ARRAY['zoho.com', 'zohomail.com'], true, 'Zoho Enterprise & Business Mail Service'),
    ('Yandex Mail', 'yandex', ARRAY['yandex.ru', 'yandex.com', 'ya.ru'], true, 'Yandex Mail Services'),
    ('Mail.ru', 'mailru', ARRAY['mail.ru', 'inbox.ru', 'bk.ru', 'list.ru'], true, 'VK / Mail.ru Russian email ecosystem'),
    ('QQ Mail', 'qq', ARRAY['qq.com'], true, 'Tencent QQ Mail Service'),
    ('163.com', 'net163', ARRAY['163.com'], true, 'NetEase 163 Mail Service'),
    ('126.com', 'net126', ARRAY['126.com'], true, 'NetEase 126 Mail Service'),
    ('Naver', 'naver', ARRAY['naver.com'], true, 'Naver South Korea Mail Service'),
    ('WEB.DE', 'webde', ARRAY['web.de'], true, 'German web portal email provider'),
    ('Freenet Mail', 'freenet', ARRAY['freenet.de'], true, 'Freenet AG German communications service'),
    ('Orange Mail', 'orange', ARRAY['orange.fr', 'wanadoo.fr'], true, 'Orange France ISP mailbox'),
    ('La Poste', 'laposte', ARRAY['laposte.net'], true, 'French postal service consumer email'),
    ('Libero', 'libero', ARRAY['libero.it', 'iol.it'], true, 'Italiaonline Libero Mail'),
    ('Seznam', 'seznam', ARRAY['seznam.cz', 'email.cz', 'post.cz'], true, 'Czech Republic primary web portal'),
    ('UKR.NET', 'ukrnet', ARRAY['ukr.net'], true, 'Ukraine primary consumer webmail portal')
ON CONFLICT (code) DO NOTHING;

-- Seed Starter Countries (ISO 3166-1 alpha-2)
INSERT INTO countries (code, name, is_active) VALUES
    ('US', 'United States', true),
    ('GB', 'United Kingdom', true),
    ('CA', 'Canada', true),
    ('AU', 'Australia', true),
    ('DE', 'Germany', true),
    ('FR', 'France', true),
    ('IT', 'Italy', true),
    ('ES', 'Spain', true),
    ('NL', 'Netherlands', true),
    ('BR', 'Brazil', true),
    ('JP', 'Japan', true),
    ('IN', 'India', true),
    ('MX', 'Mexico', true),
    ('PL', 'Poland', true),
    ('CZ', 'Czech Republic', true),
    ('UA', 'Ukraine', true),
    ('ZA', 'South Africa', true),
    ('SE', 'Sweden', true),
    ('CH', 'Switzerland', true),
    ('SG', 'Singapore', true)
ON CONFLICT (code) DO NOTHING;

-- Seed Starter Verticals
INSERT INTO verticals (name, code, description, is_active) VALUES
    ('Retail & E-commerce', 'retail', 'Direct-to-consumer goods, apparel, retail stores, and online marketplaces', true),
    ('Financial Services', 'finance', 'Banking, loans, insurance, credit cards, and fintech applications', true),
    ('Technology & SaaS', 'technology', 'Software as a service, hardware, IT solutions, and digital infrastructure', true),
    ('Travel & Hospitality', 'travel', 'Airlines, hotel bookings, vacation packages, and car rentals', true),
    ('Healthcare & Wellness', 'health', 'Fitness, pharmaceuticals, medical practices, and wellness products', true),
    ('Education & Training', 'education', 'Universities, online courses, certification programs, and tutoring', true),
    ('Automotive', 'automotive', 'Car dealerships, auto parts, maintenance services, and vehicle rentals', true),
    ('Gaming & Entertainment', 'gaming', 'Video games, streaming platforms, digital entertainment, and media events', true),
    ('Real Estate', 'real_estate', 'Property sales, residential rentals, commercial leasing, and mortgages', true),
    ('B2B & Professional Services', 'b2b', 'Consulting, marketing agencies, legal services, and enterprise vendors', true)
ON CONFLICT (code) DO NOTHING;

-- Seed Starter Sending ESPs
INSERT INTO sending_esps (name, code, api_type, is_active, notes) VALUES
    ('Amazon SES', 'ses', 'api', true, 'AWS Simple Email Service transactional & bulk relay'),
    ('SendGrid', 'sendgrid', 'api', true, 'Twilio SendGrid email delivery API'),
    ('SparkPost', 'sparkpost', 'api', true, 'MessageBird / SparkPost cloud delivery platform'),
    ('Mailgun', 'mailgun', 'api', true, 'Sinch Mailgun transactional routing'),
    ('Custom PowerMTA', 'powermta', 'powermta', true, 'Internal bare-metal PowerMTA cluster with native accounting')
ON CONFLICT (code) DO NOTHING;

-- Seed Starter Sending IP Pools
INSERT INTO sending_ip_pools (name, code, description, is_active) VALUES
    ('Default Shared Pool', 'default-pool', 'Default pool for initial outbound mail distribution', true),
    ('Warmup Rotation Pool', 'warmup-pool', 'Gradual throughput ramping pool for newly allocated IPs', true),
    ('High Reputation Pool', 'high-rep-pool', 'Reserved exclusively for high-engagement openers & clickers', true)
ON CONFLICT (code) DO NOTHING;

-- Add RBAC permissions for new resources
INSERT INTO role_permissions (role_name, resource, can_view, can_insert, can_update, can_delete) VALUES
    ('admin', 'mail_lists',        true, true, true, true),
    ('admin', 'contacts',          true, true, true, true),
    ('admin', 'imports',           true, true, true, true),
    ('admin', 'suppressions',      true, true, true, true),
    ('admin', 'mailbox_providers', true, true, true, true),
    ('admin', 'sending_esps',      true, true, true, true),
    ('admin', 'sending_ip_pools',  true, true, true, true),
    ('admin', 'countries',         true, true, true, true),
    ('admin', 'verticals',         true, true, true, true),
    ('admin', 'data_settings',     true, true, true, true),

    ('operator', 'mail_lists',        true, true, true, false),
    ('operator', 'contacts',          true, true, true, true),
    ('operator', 'imports',           true, true, true, false),
    ('operator', 'suppressions',      true, true, true, false),
    ('operator', 'mailbox_providers', true, false, false, false),
    ('operator', 'sending_esps',      true, false, false, false),
    ('operator', 'sending_ip_pools',  true, true, true, false),
    ('operator', 'countries',         true, false, false, false),
    ('operator', 'verticals',         true, false, false, false),
    ('operator', 'data_settings',     true, false, false, false),

    ('viewer', 'mail_lists',        true, false, false, false),
    ('viewer', 'contacts',          true, false, false, false),
    ('viewer', 'imports',           true, false, false, false),
    ('viewer', 'suppressions',      true, false, false, false),
    ('viewer', 'mailbox_providers', true, false, false, false),
    ('viewer', 'sending_esps',      true, false, false, false),
    ('viewer', 'sending_ip_pools',  true, false, false, false),
    ('viewer', 'countries',         true, false, false, false),
    ('viewer', 'verticals',         true, false, false, false),
    ('viewer', 'data_settings',     true, false, false, false)
ON CONFLICT (role_name, resource) DO NOTHING;
