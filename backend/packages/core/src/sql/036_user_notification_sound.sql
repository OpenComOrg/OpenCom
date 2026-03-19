ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notification_sound_url TEXT NULL AFTER banner_url;
