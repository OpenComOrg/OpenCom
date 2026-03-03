CREATE TABLE IF NOT EXISTS PRIVATE_CALLS (
  id VARCHAR(64)
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_uca1400_ai_ci
    PRIMARY KEY,

  user_1 VARCHAR(64) NOT NULL,
  user_2 VARCHAR(64) NOT NULL,

  channel_id VARCHAR(64) NOT NULL,
  token VARCHAR(128) NOT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  ended_at TIMESTAMP NULL DEFAULT NULL

  -- Prevent duplicate channel IDs
  UNIQUE KEY unique_channel (channel_id),

  -- Indexes for fast lookups
  INDEX idx_user_1 (user_1),
  INDEX idx_user_2 (user_2),
  INDEX idx_active (active)

) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_uca1400_ai_ci;
