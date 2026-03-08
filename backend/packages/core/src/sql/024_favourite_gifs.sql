CREATE TABLE IF NOT EXISTS FAVOURITE_GIFS (
  id VARCHAR(64)


  user_1 VARCHAR(64) NOT NULL,
  user_2 VARCHAR(64) NOT NULL,

  channel_id VARCHAR(64) NOT NULL,
  token VARCHAR(128) NOT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL DEFAULT NULL,

  active BOOLEAN NOT NULL DEFAULT TRUE,

  UNIQUE KEY unique_channel (channel_id),

  INDEX idx_user_1 (user_1),
  INDEX idx_user_2 (user_2),
  INDEX idx_active (active)

) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_uca1400_ai_ci;
