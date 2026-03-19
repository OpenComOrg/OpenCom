ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS report_target_user_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NULL AFTER opencom_username;

ALTER TABLE support_tickets
  ADD INDEX idx_support_tickets_report_target_activity (report_target_user_id, last_activity_at),
  ADD CONSTRAINT fk_support_tickets_report_target_user FOREIGN KEY (report_target_user_id) REFERENCES users(id) ON DELETE SET NULL;
