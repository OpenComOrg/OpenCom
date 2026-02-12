CREATE TABLE IF NOT EXISTS social_dm_call_signals (
  id VARCHAR(32) PRIMARY KEY,
  thread_id VARCHAR(32) NOT NULL,
  from_user_id VARCHAR(32) NOT NULL,
  target_user_id VARCHAR(32) NOT NULL,
  type VARCHAR(16) NOT NULL,
  payload_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dm_call_target (thread_id, target_user_id, created_at),
  INDEX idx_dm_call_from (from_user_id, created_at),
  CONSTRAINT fk_dm_call_thread FOREIGN KEY (thread_id) REFERENCES social_dm_threads(id) ON DELETE CASCADE,
  CONSTRAINT fk_dm_call_from_user FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_dm_call_target_user FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE
);
