ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP NULL;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci PRIMARY KEY,
  user_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NOT NULL,
  token_hash VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_evt_hash (token_hash),
  INDEX idx_evt_user (user_id),
  CONSTRAINT fk_evt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
