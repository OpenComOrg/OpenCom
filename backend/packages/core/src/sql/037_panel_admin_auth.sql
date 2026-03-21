CREATE TABLE IF NOT EXISTS panel_admin_users (
  id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci PRIMARY KEY,
  email VARCHAR(190) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NOT NULL,
  username VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NOT NULL,
  password_hash TEXT NOT NULL,
  role ENUM('owner','admin','staff') NOT NULL DEFAULT 'staff',
  title VARCHAR(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NOT NULL DEFAULT 'Staff',
  permissions_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  notes VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NULL,
  assigned_by VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NULL,
  two_factor_enabled TINYINT(1) NOT NULL DEFAULT 0,
  force_two_factor_setup TINYINT(1) NOT NULL DEFAULT 1,
  totp_secret_encrypted TEXT NULL,
  last_login_at TIMESTAMP NULL DEFAULT NULL,
  disabled_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_panel_admin_users_email (email),
  INDEX idx_panel_admin_users_role (role),
  INDEX idx_panel_admin_users_assigned_by (assigned_by),
  CONSTRAINT fk_panel_admin_users_assigned_by
    FOREIGN KEY (assigned_by) REFERENCES panel_admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE IF NOT EXISTS panel_admin_refresh_tokens (
  id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci PRIMARY KEY,
  admin_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NOT NULL,
  token_hash VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_panel_admin_refresh_tokens_hash (token_hash),
  INDEX idx_panel_admin_refresh_tokens_admin (admin_id, revoked_at, expires_at),
  CONSTRAINT fk_panel_admin_refresh_tokens_admin
    FOREIGN KEY (admin_id) REFERENCES panel_admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE IF NOT EXISTS panel_admin_2fa_setup_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NOT NULL,
  token_hash VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NOT NULL,
  secret_encrypted TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_panel_admin_2fa_setup_tokens_hash (token_hash),
  INDEX idx_panel_admin_2fa_setup_tokens_admin (admin_id, consumed_at, expires_at),
  CONSTRAINT fk_panel_admin_2fa_setup_tokens_admin
    FOREIGN KEY (admin_id) REFERENCES panel_admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE IF NOT EXISTS panel_admin_recovery_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NOT NULL,
  code_hash VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NOT NULL,
  used_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_panel_admin_recovery_codes (admin_id, code_hash),
  INDEX idx_panel_admin_recovery_codes_admin_used (admin_id, used_at),
  CONSTRAINT fk_panel_admin_recovery_codes_admin
    FOREIGN KEY (admin_id) REFERENCES panel_admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
