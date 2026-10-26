-- Down migration: Rollback server inventory and MTA tables

DELETE FROM role_permissions WHERE resource IN ('server_providers', 'vmtas', 'proxies');
DROP TABLE IF EXISTS proxy_servers CASCADE;
DROP TABLE IF EXISTS vmtas CASCADE;
DROP TABLE IF EXISTS server_ips CASCADE;
ALTER TABLE servers DROP COLUMN IF EXISTS main_ip;
ALTER TABLE servers DROP COLUMN IF EXISTS mta_software;
ALTER TABLE servers DROP COLUMN IF EXISTS mta_installed;
ALTER TABLE servers DROP COLUMN IF EXISTS port_25_status;
ALTER TABLE servers DROP COLUMN IF EXISTS server_type;
ALTER TABLE servers DROP COLUMN IF EXISTS provider_id;
DROP TABLE IF EXISTS server_providers CASCADE;
