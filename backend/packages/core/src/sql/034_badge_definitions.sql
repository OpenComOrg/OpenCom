CREATE TABLE IF NOT EXISTS badge_definitions (
  badge_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci PRIMARY KEY,
  display_name VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NOT NULL,
  description VARCHAR(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NULL,
  icon VARCHAR(24) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NULL,
  image_url TEXT NULL,
  bg_color VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NULL,
  fg_color VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NULL,
  created_by_user_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NULL,
  updated_by_user_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_badge_definitions_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_badge_definitions_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
