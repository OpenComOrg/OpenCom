ALTER TABLE admin_boost_grants DROP FOREIGN KEY fk_admin_boost_grants_granted_by;
ALTER TABLE admin_boost_grants DROP FOREIGN KEY fk_admin_boost_grants_revoked_by;
ALTER TABLE account_bans DROP FOREIGN KEY fk_account_bans_banned_by;
ALTER TABLE blog_posts DROP FOREIGN KEY fk_blog_posts_created_by;
ALTER TABLE blog_posts DROP FOREIGN KEY fk_blog_posts_updated_by;
ALTER TABLE badge_definitions DROP FOREIGN KEY fk_badge_definitions_created_by;
ALTER TABLE badge_definitions DROP FOREIGN KEY fk_badge_definitions_updated_by;
