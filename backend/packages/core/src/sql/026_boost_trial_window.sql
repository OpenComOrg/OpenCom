ALTER TABLE platform_config
  ADD COLUMN IF NOT EXISTS boost_trial_starts_at DATETIME NULL AFTER founder_user_id,
  ADD COLUMN IF NOT EXISTS boost_trial_ends_at DATETIME NULL AFTER boost_trial_starts_at;

INSERT INTO platform_config (id, founder_user_id)
VALUES (1, NULL)
ON DUPLICATE KEY UPDATE id=id;

UPDATE platform_config
SET boost_trial_starts_at=NULL,
    boost_trial_ends_at=NULL
WHERE id=1
  AND boost_trial_starts_at IS NOT NULL
  AND boost_trial_ends_at IS NOT NULL
  AND boost_trial_ends_at <= boost_trial_starts_at;
