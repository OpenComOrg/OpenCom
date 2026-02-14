ALTER TABLE servers
  ADD COLUMN node_server_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NULL,
  ADD COLUMN node_gateway_url TEXT NULL,
  ADD COLUMN node_guild_count INT NOT NULL DEFAULT 0,
  ADD COLUMN node_last_sync_at TIMESTAMP NULL,
  ADD COLUMN node_sync_status VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NOT NULL DEFAULT 'unknown';
