-- Keep the active account on the base username.
-- If one duplicate is banned/deactivated (account_bans), that one loses the name first.
-- Otherwise the newest duplicate loses the name.

-- Duplicate username resolution pass 1
DROP TEMPORARY TABLE IF EXISTS tmp_username_ranked;
CREATE TEMPORARY TABLE tmp_username_ranked AS
SELECT ranked.id, ranked.username, ranked.group_key, ranked.username_rank, ranked.username_count
FROM (
  SELECT u.id,
         u.username,
         u.username AS group_key,
         ROW_NUMBER() OVER (
           PARTITION BY u.username
           ORDER BY CASE WHEN ab.user_id IS NULL THEN 0 ELSE 1 END ASC,
                    u.created_at ASC,
                    u.id ASC
         ) AS username_rank,
         COUNT(*) OVER (
           PARTITION BY u.username
         ) AS username_count
  FROM users u
  LEFT JOIN account_bans ab ON ab.user_id = u.id
) ranked;

DROP TEMPORARY TABLE IF EXISTS tmp_username_bases;
CREATE TEMPORARY TABLE tmp_username_bases AS
SELECT winners.group_key,
       winners.base_username,
       COALESCE(MAX(
         CASE
           WHEN u.username = winners.group_key THEN 1
           WHEN SUBSTRING(u.username, 1, CHAR_LENGTH(winners.base_username)) = winners.group_key
             AND SUBSTRING(u.username, CHAR_LENGTH(winners.base_username) + 1) REGEXP '^[0-9]+$'
           THEN CAST(SUBSTRING(u.username, CHAR_LENGTH(winners.base_username) + 1) AS UNSIGNED)
           ELSE NULL
         END
       ), 1) AS max_suffix
FROM (
  SELECT group_key, username AS base_username
  FROM tmp_username_ranked
  WHERE username_count > 1 AND username_rank = 1
) winners
JOIN users u ON 1=1
GROUP BY winners.group_key, winners.base_username;

DROP TEMPORARY TABLE IF EXISTS tmp_username_renames;
CREATE TEMPORARY TABLE tmp_username_renames AS
SELECT r.id,
       CONCAT(
         LEFT(
           b.base_username,
           GREATEST(0, 32 - CHAR_LENGTH(CAST(b.max_suffix + r.username_rank - 1 AS CHAR)))
         ),
         CAST(b.max_suffix + r.username_rank - 1 AS CHAR)
       ) AS next_username
FROM tmp_username_ranked r
JOIN tmp_username_bases b ON r.group_key = b.group_key
WHERE r.username_count > 1
  AND r.username_rank > 1;

UPDATE users u
JOIN tmp_username_renames r ON r.id = u.id
SET u.username = r.next_username;

DROP TEMPORARY TABLE IF EXISTS tmp_username_renames;
DROP TEMPORARY TABLE IF EXISTS tmp_username_bases;
DROP TEMPORARY TABLE IF EXISTS tmp_username_ranked;

-- Duplicate username resolution pass 2
DROP TEMPORARY TABLE IF EXISTS tmp_username_ranked;
CREATE TEMPORARY TABLE tmp_username_ranked AS
SELECT ranked.id, ranked.username, ranked.group_key, ranked.username_rank, ranked.username_count
FROM (
  SELECT u.id,
         u.username,
         u.username AS group_key,
         ROW_NUMBER() OVER (
           PARTITION BY u.username
           ORDER BY CASE WHEN ab.user_id IS NULL THEN 0 ELSE 1 END ASC,
                    u.created_at ASC,
                    u.id ASC
         ) AS username_rank,
         COUNT(*) OVER (
           PARTITION BY u.username
         ) AS username_count
  FROM users u
  LEFT JOIN account_bans ab ON ab.user_id = u.id
) ranked;

DROP TEMPORARY TABLE IF EXISTS tmp_username_bases;
CREATE TEMPORARY TABLE tmp_username_bases AS
SELECT winners.group_key,
       winners.base_username,
       COALESCE(MAX(
         CASE
           WHEN u.username = winners.group_key THEN 1
           WHEN SUBSTRING(u.username, 1, CHAR_LENGTH(winners.base_username)) = winners.group_key
             AND SUBSTRING(u.username, CHAR_LENGTH(winners.base_username) + 1) REGEXP '^[0-9]+$'
           THEN CAST(SUBSTRING(u.username, CHAR_LENGTH(winners.base_username) + 1) AS UNSIGNED)
           ELSE NULL
         END
       ), 1) AS max_suffix
FROM (
  SELECT group_key, username AS base_username
  FROM tmp_username_ranked
  WHERE username_count > 1 AND username_rank = 1
) winners
JOIN users u ON 1=1
GROUP BY winners.group_key, winners.base_username;

DROP TEMPORARY TABLE IF EXISTS tmp_username_renames;
CREATE TEMPORARY TABLE tmp_username_renames AS
SELECT r.id,
       CONCAT(
         LEFT(
           b.base_username,
           GREATEST(0, 32 - CHAR_LENGTH(CAST(b.max_suffix + r.username_rank - 1 AS CHAR)))
         ),
         CAST(b.max_suffix + r.username_rank - 1 AS CHAR)
       ) AS next_username
FROM tmp_username_ranked r
JOIN tmp_username_bases b ON r.group_key = b.group_key
WHERE r.username_count > 1
  AND r.username_rank > 1;

UPDATE users u
JOIN tmp_username_renames r ON r.id = u.id
SET u.username = r.next_username;

DROP TEMPORARY TABLE IF EXISTS tmp_username_renames;
DROP TEMPORARY TABLE IF EXISTS tmp_username_bases;
DROP TEMPORARY TABLE IF EXISTS tmp_username_ranked;

-- Duplicate username resolution pass 3
DROP TEMPORARY TABLE IF EXISTS tmp_username_ranked;
CREATE TEMPORARY TABLE tmp_username_ranked AS
SELECT ranked.id, ranked.username, ranked.group_key, ranked.username_rank, ranked.username_count
FROM (
  SELECT u.id,
         u.username,
         u.username AS group_key,
         ROW_NUMBER() OVER (
           PARTITION BY u.username
           ORDER BY CASE WHEN ab.user_id IS NULL THEN 0 ELSE 1 END ASC,
                    u.created_at ASC,
                    u.id ASC
         ) AS username_rank,
         COUNT(*) OVER (
           PARTITION BY u.username
         ) AS username_count
  FROM users u
  LEFT JOIN account_bans ab ON ab.user_id = u.id
) ranked;

DROP TEMPORARY TABLE IF EXISTS tmp_username_bases;
CREATE TEMPORARY TABLE tmp_username_bases AS
SELECT winners.group_key,
       winners.base_username,
       COALESCE(MAX(
         CASE
           WHEN u.username = winners.group_key THEN 1
           WHEN SUBSTRING(u.username, 1, CHAR_LENGTH(winners.base_username)) = winners.group_key
             AND SUBSTRING(u.username, CHAR_LENGTH(winners.base_username) + 1) REGEXP '^[0-9]+$'
           THEN CAST(SUBSTRING(u.username, CHAR_LENGTH(winners.base_username) + 1) AS UNSIGNED)
           ELSE NULL
         END
       ), 1) AS max_suffix
FROM (
  SELECT group_key, username AS base_username
  FROM tmp_username_ranked
  WHERE username_count > 1 AND username_rank = 1
) winners
JOIN users u ON 1=1
GROUP BY winners.group_key, winners.base_username;

DROP TEMPORARY TABLE IF EXISTS tmp_username_renames;
CREATE TEMPORARY TABLE tmp_username_renames AS
SELECT r.id,
       CONCAT(
         LEFT(
           b.base_username,
           GREATEST(0, 32 - CHAR_LENGTH(CAST(b.max_suffix + r.username_rank - 1 AS CHAR)))
         ),
         CAST(b.max_suffix + r.username_rank - 1 AS CHAR)
       ) AS next_username
FROM tmp_username_ranked r
JOIN tmp_username_bases b ON r.group_key = b.group_key
WHERE r.username_count > 1
  AND r.username_rank > 1;

UPDATE users u
JOIN tmp_username_renames r ON r.id = u.id
SET u.username = r.next_username;

DROP TEMPORARY TABLE IF EXISTS tmp_username_renames;
DROP TEMPORARY TABLE IF EXISTS tmp_username_bases;
DROP TEMPORARY TABLE IF EXISTS tmp_username_ranked;

-- Duplicate username resolution pass 4
DROP TEMPORARY TABLE IF EXISTS tmp_username_ranked;
CREATE TEMPORARY TABLE tmp_username_ranked AS
SELECT ranked.id, ranked.username, ranked.group_key, ranked.username_rank, ranked.username_count
FROM (
  SELECT u.id,
         u.username,
         u.username AS group_key,
         ROW_NUMBER() OVER (
           PARTITION BY u.username
           ORDER BY CASE WHEN ab.user_id IS NULL THEN 0 ELSE 1 END ASC,
                    u.created_at ASC,
                    u.id ASC
         ) AS username_rank,
         COUNT(*) OVER (
           PARTITION BY u.username
         ) AS username_count
  FROM users u
  LEFT JOIN account_bans ab ON ab.user_id = u.id
) ranked;

DROP TEMPORARY TABLE IF EXISTS tmp_username_bases;
CREATE TEMPORARY TABLE tmp_username_bases AS
SELECT winners.group_key,
       winners.base_username,
       COALESCE(MAX(
         CASE
           WHEN u.username = winners.group_key THEN 1
           WHEN SUBSTRING(u.username, 1, CHAR_LENGTH(winners.base_username)) = winners.group_key
             AND SUBSTRING(u.username, CHAR_LENGTH(winners.base_username) + 1) REGEXP '^[0-9]+$'
           THEN CAST(SUBSTRING(u.username, CHAR_LENGTH(winners.base_username) + 1) AS UNSIGNED)
           ELSE NULL
         END
       ), 1) AS max_suffix
FROM (
  SELECT group_key, username AS base_username
  FROM tmp_username_ranked
  WHERE username_count > 1 AND username_rank = 1
) winners
JOIN users u ON 1=1
GROUP BY winners.group_key, winners.base_username;

DROP TEMPORARY TABLE IF EXISTS tmp_username_renames;
CREATE TEMPORARY TABLE tmp_username_renames AS
SELECT r.id,
       CONCAT(
         LEFT(
           b.base_username,
           GREATEST(0, 32 - CHAR_LENGTH(CAST(b.max_suffix + r.username_rank - 1 AS CHAR)))
         ),
         CAST(b.max_suffix + r.username_rank - 1 AS CHAR)
       ) AS next_username
FROM tmp_username_ranked r
JOIN tmp_username_bases b ON r.group_key = b.group_key
WHERE r.username_count > 1
  AND r.username_rank > 1;

UPDATE users u
JOIN tmp_username_renames r ON r.id = u.id
SET u.username = r.next_username;

DROP TEMPORARY TABLE IF EXISTS tmp_username_renames;
DROP TEMPORARY TABLE IF EXISTS tmp_username_bases;
DROP TEMPORARY TABLE IF EXISTS tmp_username_ranked;

-- Duplicate username resolution pass 5
DROP TEMPORARY TABLE IF EXISTS tmp_username_ranked;
CREATE TEMPORARY TABLE tmp_username_ranked AS
SELECT ranked.id, ranked.username, ranked.group_key, ranked.username_rank, ranked.username_count
FROM (
  SELECT u.id,
         u.username,
         u.username AS group_key,
         ROW_NUMBER() OVER (
           PARTITION BY u.username
           ORDER BY CASE WHEN ab.user_id IS NULL THEN 0 ELSE 1 END ASC,
                    u.created_at ASC,
                    u.id ASC
         ) AS username_rank,
         COUNT(*) OVER (
           PARTITION BY u.username
         ) AS username_count
  FROM users u
  LEFT JOIN account_bans ab ON ab.user_id = u.id
) ranked;

DROP TEMPORARY TABLE IF EXISTS tmp_username_bases;
CREATE TEMPORARY TABLE tmp_username_bases AS
SELECT winners.group_key,
       winners.base_username,
       COALESCE(MAX(
         CASE
           WHEN u.username = winners.group_key THEN 1
           WHEN SUBSTRING(u.username, 1, CHAR_LENGTH(winners.base_username)) = winners.group_key
             AND SUBSTRING(u.username, CHAR_LENGTH(winners.base_username) + 1) REGEXP '^[0-9]+$'
           THEN CAST(SUBSTRING(u.username, CHAR_LENGTH(winners.base_username) + 1) AS UNSIGNED)
           ELSE NULL
         END
       ), 1) AS max_suffix
FROM (
  SELECT group_key, username AS base_username
  FROM tmp_username_ranked
  WHERE username_count > 1 AND username_rank = 1
) winners
JOIN users u ON 1=1
GROUP BY winners.group_key, winners.base_username;

DROP TEMPORARY TABLE IF EXISTS tmp_username_renames;
CREATE TEMPORARY TABLE tmp_username_renames AS
SELECT r.id,
       CONCAT(
         LEFT(
           b.base_username,
           GREATEST(0, 32 - CHAR_LENGTH(CAST(b.max_suffix + r.username_rank - 1 AS CHAR)))
         ),
         CAST(b.max_suffix + r.username_rank - 1 AS CHAR)
       ) AS next_username
FROM tmp_username_ranked r
JOIN tmp_username_bases b ON r.group_key = b.group_key
WHERE r.username_count > 1
  AND r.username_rank > 1;

UPDATE users u
JOIN tmp_username_renames r ON r.id = u.id
SET u.username = r.next_username;

DROP TEMPORARY TABLE IF EXISTS tmp_username_renames;
DROP TEMPORARY TABLE IF EXISTS tmp_username_bases;
DROP TEMPORARY TABLE IF EXISTS tmp_username_ranked;

ALTER TABLE users
  ADD UNIQUE KEY uq_users_username (username);

ALTER TABLE invites
  ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT FALSE AFTER created_by,
  ADD COLUMN IF NOT EXISTS is_permanent BOOLEAN NOT NULL DEFAULT FALSE AFTER is_custom;

UPDATE invites
SET is_permanent = CASE
  WHEN max_uses IS NULL AND expires_at IS NULL THEN 1
  ELSE 0
END
WHERE is_permanent = 0;

ALTER TABLE invites
  ADD KEY idx_invites_server_custom_created (server_id, is_custom, created_at);

CREATE TABLE IF NOT EXISTS invite_code_reservations (
  code VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci PRIMARY KEY,
  reserved_server_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NOT NULL,
  owner_user_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NOT NULL,
  locked_until TIMESTAMP NOT NULL,
  reason VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_invite_code_reservations_server FOREIGN KEY (reserved_server_id) REFERENCES servers(id) ON DELETE CASCADE,
  CONSTRAINT fk_invite_code_reservations_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
