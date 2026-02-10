CREATE TABLE IF NOT EXISTS schema_migrations (
  id VARCHAR(64) PRIMARY KEY,
  ran_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS guilds (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  owner_user_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(64) PRIMARY KEY,
  guild_id VARCHAR(64) NOT NULL,
  name VARCHAR(64) NOT NULL,
  color INT NULL,
  position INT NOT NULL DEFAULT 0,
  permissions BIGINT UNSIGNED NOT NULL DEFAULT 0,
  is_everyone BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_roles_guild (guild_id),
  CONSTRAINT fk_roles_guild FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS guild_members (
  guild_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  nick VARCHAR(64),
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, user_id),
  CONSTRAINT fk_gm_guild FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS member_roles (
  guild_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  role_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (guild_id, user_id, role_id),
  CONSTRAINT fk_mr_member FOREIGN KEY (guild_id, user_id) REFERENCES guild_members(guild_id, user_id) ON DELETE CASCADE,
  CONSTRAINT fk_mr_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS channels (
  id VARCHAR(64) PRIMARY KEY,
  guild_id VARCHAR(64) NOT NULL,
  name VARCHAR(64) NOT NULL,
  type VARCHAR(16) NOT NULL DEFAULT 'text', -- text|voice|category
  position INT NOT NULL DEFAULT 0,
  parent_id VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_channels_guild (guild_id),
  CONSTRAINT fk_channels_guild FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);

-- Discord-style permission overwrites (allow/deny bitsets) on a channel
CREATE TABLE IF NOT EXISTS channel_overwrites (
  channel_id VARCHAR(64) NOT NULL,
  target_type VARCHAR(8) NOT NULL, -- role|member
  target_id VARCHAR(64) NOT NULL,   -- role_id or user_id
  allow BIGINT UNSIGNED NOT NULL DEFAULT 0,
  deny BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (channel_id, target_type, target_id),
  CONSTRAINT fk_ov_channel FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(64) PRIMARY KEY,
  channel_id VARCHAR(64) NOT NULL,
  author_id VARCHAR(64) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_msg_channel_time (channel_id, created_at),
  CONSTRAINT fk_msg_channel FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

-- Attachments metadata (file lives on provider-hosted node storage)
CREATE TABLE IF NOT EXISTS attachments (
  id VARCHAR(64) PRIMARY KEY,
  guild_id VARCHAR(64) NOT NULL,
  channel_id VARCHAR(64) NOT NULL,
  message_id VARCHAR(64) NULL,
  uploader_id VARCHAR(64) NOT NULL,
  object_key TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  content_type VARCHAR(128) NOT NULL,
  size_bytes INT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_att_expires (expires_at),
  CONSTRAINT fk_att_guild FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
  CONSTRAINT fk_att_channel FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  CONSTRAINT fk_att_msg FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
);

-- Voice state snapshot (signaling plane)
CREATE TABLE IF NOT EXISTS voice_states (
  guild_id VARCHAR(64) NOT NULL,
  channel_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  muted BOOLEAN NOT NULL DEFAULT FALSE,
  deafened BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, user_id),
  CONSTRAINT fk_vs_guild FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
  CONSTRAINT fk_vs_channel FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);
