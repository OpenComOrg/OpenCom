CREATE TABLE IF NOT EXISTS friend_requests (
  id VARCHAR(64) PRIMARY KEY,
  sender_user_id VARCHAR(64) NOT NULL,
  recipient_user_id VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  responded_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pending_pair (sender_user_id, recipient_user_id),
  INDEX idx_friend_requests_recipient_status (recipient_user_id, status),
  CONSTRAINT fk_friend_request_sender FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_friend_request_recipient FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS social_settings (
  user_id VARCHAR(64) PRIMARY KEY,
  allow_friend_requests TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_social_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
