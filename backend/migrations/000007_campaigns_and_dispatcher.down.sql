-- Down migration: Rollback campaigns and dispatcher engine

DELETE FROM role_permissions WHERE resource = 'campaigns';
DROP TABLE IF EXISTS campaign_logs;
DROP TABLE IF EXISTS campaigns;
