CREATE TABLE IF NOT EXISTS favourite_media (
  id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci PRIMARY KEY,
  user_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NOT NULL,
  source_kind VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NOT NULL,
  source_url_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  source_url TEXT NOT NULL,
  page_url TEXT NULL,
  title VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NULL,
  file_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NULL,
  content_type VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NULL,
  server_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NULL,
  thread_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NULL,
  message_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_favourite_media_user_source (user_id, source_kind, source_url_hash),
  INDEX idx_favourite_media_user_updated (user_id, updated_at),
  CONSTRAINT fk_favourite_media_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
