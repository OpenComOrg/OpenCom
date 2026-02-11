CREATE TABLE IF NOT EXISTS friendships (
  user_id VARCHAR(64) NOT NULL,
  friend_user_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, friend_user_id),
  CONSTRAINT fk_friendships_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_friendships_friend FOREIGN KEY (friend_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS social_dm_threads (
  id VARCHAR(64) PRIMARY KEY,
  user_a VARCHAR(64) NOT NULL,
  user_b VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_message_at TIMESTAMP NULL,
  UNIQUE KEY uq_social_dm_pair (user_a, user_b),
  CONSTRAINT fk_social_dm_user_a FOREIGN KEY (user_a) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_social_dm_user_b FOREIGN KEY (user_b) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS social_dm_messages (
  id VARCHAR(64) PRIMARY KEY,
  thread_id VARCHAR(64) NOT NULL,
  sender_user_id VARCHAR(64) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_social_dm_messages_thread_time (thread_id, created_at),
  CONSTRAINT fk_social_dm_messages_thread FOREIGN KEY (thread_id) REFERENCES social_dm_threads(id) ON DELETE CASCADE,
  CONSTRAINT fk_social_dm_messages_sender FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE
);
