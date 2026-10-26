-- Up migration: Campaigns and Mailing Dispatcher Engine

-- 1. Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    from_name VARCHAR(255) NOT NULL,
    from_email VARCHAR(255) NOT NULL,
    reply_to VARCHAR(255),
    mail_list_id UUID NOT NULL REFERENCES mail_lists(id) ON DELETE RESTRICT,
    audience_filter JSONB NOT NULL DEFAULT '{}',
    routing_type VARCHAR(64) NOT NULL DEFAULT 'file_spool', -- 'file_spool', 'ip_pool', 'sending_esp', 'custom_vmta'
    sending_ip_pool_id UUID REFERENCES sending_ip_pools(id) ON DELETE SET NULL,
    sending_esp_id UUID REFERENCES sending_esps(id) ON DELETE SET NULL,
    custom_vmta VARCHAR(128),
    html_content TEXT NOT NULL DEFAULT '',
    plain_content TEXT NOT NULL DEFAULT '',
    custom_headers JSONB NOT NULL DEFAULT '{}',
    track_opens BOOLEAN NOT NULL DEFAULT true,
    track_clicks BOOLEAN NOT NULL DEFAULT true,
    list_unsubscribe_header BOOLEAN NOT NULL DEFAULT true,
    scheduled_at TIMESTAMPTZ,
    hourly_limit INT NOT NULL DEFAULT 0, -- 0 = unlimited / max speed
    batch_size INT NOT NULL DEFAULT 500,
    status VARCHAR(32) NOT NULL DEFAULT 'draft', -- 'draft', 'scheduled', 'queued', 'processing', 'paused', 'completed', 'failed', 'cancelled'
    total_recipients INT NOT NULL DEFAULT 0,
    processed_count INT NOT NULL DEFAULT 0,
    sent_count INT NOT NULL DEFAULT 0,
    suppressed_count INT NOT NULL DEFAULT 0,
    failed_count INT NOT NULL DEFAULT 0,
    spool_path TEXT NOT NULL DEFAULT '',
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_mail_list_id ON campaigns(mail_list_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at DESC);

-- 2. Campaign Logs / Spool History
CREATE TABLE IF NOT EXISTS campaign_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    email VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL, -- 'spooled', 'suppressed', 'failed'
    message_id VARCHAR(255),
    file_path TEXT,
    details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_logs_campaign_id ON campaign_logs(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_campaign_status ON campaign_logs(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_email ON campaign_logs(email);

-- 3. RBAC Permissions for campaigns
INSERT INTO role_permissions (role_name, resource, can_view, can_insert, can_update, can_delete) VALUES
    ('admin',    'campaigns', true, true, true, true),
    ('operator', 'campaigns', true, true, true, true),
    ('viewer',   'campaigns', true, false, false, false)
ON CONFLICT (role_name, resource) DO NOTHING;
