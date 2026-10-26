-- Up migration: Role-Based Access Control and per-user/per-page permission rules

-- 1. Roles table
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(64) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed system roles
INSERT INTO roles (name, description) VALUES
    ('admin', 'Full administrative access across all infrastructure components'),
    ('operator', 'Operational control over servers, scripts, and executions with restricted deletion'),
    ('viewer', 'Read-only visibility into domains, servers, and execution logs')
ON CONFLICT (name) DO NOTHING;

-- 2. Role permissions table (matrix of view, insert, update, delete per resource)
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_name VARCHAR(64) NOT NULL REFERENCES roles(name) ON UPDATE CASCADE ON DELETE CASCADE,
    resource VARCHAR(64) NOT NULL,
    can_view BOOLEAN NOT NULL DEFAULT false,
    can_insert BOOLEAN NOT NULL DEFAULT false,
    can_update BOOLEAN NOT NULL DEFAULT false,
    can_delete BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (role_name, resource)
);

-- Seed default permissions for roles across all sections
-- Resources: 'dashboard', 'domains', 'dns', 'servers', 'credentials', 'scripts', 'executions', 'settings', 'users', 'audit'

-- Admin: full access to everything
INSERT INTO role_permissions (role_name, resource, can_view, can_insert, can_update, can_delete) VALUES
    ('admin', 'dashboard',   true, true, true, true),
    ('admin', 'domains',     true, true, true, true),
    ('admin', 'dns',         true, true, true, true),
    ('admin', 'servers',     true, true, true, true),
    ('admin', 'credentials', true, true, true, true),
    ('admin', 'scripts',     true, true, true, true),
    ('admin', 'executions',  true, true, true, true),
    ('admin', 'settings',    true, true, true, true),
    ('admin', 'users',       true, true, true, true),
    ('admin', 'audit',       true, true, true, true)
ON CONFLICT (role_name, resource) DO NOTHING;

-- Operator: operations permitted, destructive/administrative settings blocked
INSERT INTO role_permissions (role_name, resource, can_view, can_insert, can_update, can_delete) VALUES
    ('operator', 'dashboard',   true, false, false, false),
    ('operator', 'domains',     true, false, false, false),
    ('operator', 'dns',         true, true,  true,  false),
    ('operator', 'servers',     true, true,  true,  false),
    ('operator', 'credentials', true, true,  false, false),
    ('operator', 'scripts',     true, false, false, false),
    ('operator', 'executions',  true, true,  false, true), -- can trigger & cancel executions
    ('operator', 'settings',    false, false, false, false),
    ('operator', 'users',       false, false, false, false),
    ('operator', 'audit',       true, false, false, false)
ON CONFLICT (role_name, resource) DO NOTHING;

-- Viewer: view-only permissions
INSERT INTO role_permissions (role_name, resource, can_view, can_insert, can_update, can_delete) VALUES
    ('viewer', 'dashboard',   true, false, false, false),
    ('viewer', 'domains',     true, false, false, false),
    ('viewer', 'dns',         true, false, false, false),
    ('viewer', 'servers',     true, false, false, false),
    ('viewer', 'credentials', false, false, false, false),
    ('viewer', 'scripts',     true, false, false, false),
    ('viewer', 'executions',  true, false, false, false),
    ('viewer', 'settings',    false, false, false, false),
    ('viewer', 'users',       false, false, false, false),
    ('viewer', 'audit',       false, false, false, false)
ON CONFLICT (role_name, resource) DO NOTHING;

-- 3. User permissions override table (rules defined per user for each section: view, insert, delete, update)
CREATE TABLE IF NOT EXISTS user_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource VARCHAR(64) NOT NULL,
    can_view BOOLEAN NOT NULL DEFAULT false,
    can_insert BOOLEAN NOT NULL DEFAULT false,
    can_update BOOLEAN NOT NULL DEFAULT false,
    can_delete BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, resource)
);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);
