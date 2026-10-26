-- Down migration: Rollback Mail List Management & Contacts schema

DROP TABLE IF EXISTS contact_events CASCADE;
DROP TABLE IF EXISTS import_jobs CASCADE;
DROP TABLE IF EXISTS suppressions CASCADE;
DROP TABLE IF EXISTS contacts CASCADE;
DROP TABLE IF EXISTS mail_lists CASCADE;
DROP TABLE IF EXISTS verticals CASCADE;
DROP TABLE IF EXISTS countries CASCADE;
DROP TABLE IF EXISTS sending_ip_pool_members CASCADE;
DROP TABLE IF EXISTS sending_ip_pools CASCADE;
DROP TABLE IF EXISTS sending_esps CASCADE;
DROP TABLE IF EXISTS mailbox_providers CASCADE;
DROP TABLE IF EXISTS data_settings CASCADE;

DELETE FROM role_permissions WHERE resource IN (
    'mail_lists', 'contacts', 'imports', 'suppressions', 
    'mailbox_providers', 'sending_esps', 'sending_ip_pools', 
    'countries', 'verticals', 'data_settings'
);
