ALTER TABLE guilds
  ADD COLUMN IF NOT EXISTS server_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NOT NULL DEFAULT '',
  ADD INDEX IF NOT EXISTS idx_guilds_server (server_id);
