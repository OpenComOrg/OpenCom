CREATE TABLE IF NOT EXISTS platform_config (
  id TINYINT PRIMARY KEY,
  founder_user_id VARCHAR(64) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_platform_founder FOREIGN KEY (founder_user_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO platform_config (id, founder_user_id)
VALUES (1, NULL)
ON DUPLICATE KEY UPDATE id=id;

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id VARCHAR(64) PRIMARY KEY,
  added_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_platform_admin_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_platform_admin_added_by FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE CASCADE
);
