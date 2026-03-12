ALTER TABLE platform_staff_assignments
  DROP FOREIGN KEY fk_platform_staff_assignments_user,
  DROP FOREIGN KEY fk_platform_staff_assignments_assigned_by;

ALTER TABLE platform_staff_assignments
  MODIFY COLUMN user_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NOT NULL,
  MODIFY COLUMN assigned_by VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NULL;

ALTER TABLE platform_staff_assignments
  ADD CONSTRAINT fk_platform_staff_assignments_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_platform_staff_assignments_assigned_by
    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE blog_posts
  DROP FOREIGN KEY fk_blog_posts_created_by,
  DROP FOREIGN KEY fk_blog_posts_updated_by;

ALTER TABLE blog_posts
  MODIFY COLUMN id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NOT NULL,
  MODIFY COLUMN created_by VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NOT NULL,
  MODIFY COLUMN updated_by VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci NOT NULL;

ALTER TABLE blog_posts
  ADD CONSTRAINT fk_blog_posts_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_blog_posts_updated_by
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT;
