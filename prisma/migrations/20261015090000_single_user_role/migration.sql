-- Each user can have only one role. Existing role assignments are preserved.
-- If a database has multiple assignments for a user, resolve them before deploy.
CREATE UNIQUE INDEX `user_roles_user_id_key` ON `user_roles`(`user_id`);
