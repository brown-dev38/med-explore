ALTER TABLE `reward_tiers` ADD COLUMN `deleted_at` DATETIME(3) NULL;

ALTER TABLE `reward_redemptions`
  MODIFY `status` ENUM('PENDING', 'APPROVED', 'COMPLETED', 'CANCELLED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  ADD COLUMN `request_id` VARCHAR(36) NULL,
  ADD COLUMN `reviewed_by` BIGINT NULL,
  ADD COLUMN `reviewed_at` DATETIME(3) NULL;

-- Create the replacement user-prefix index before removing the unique index used by its FK.
CREATE INDEX `reward_redemptions_user_id_academic_year_id_requested_at_idx`
  ON `reward_redemptions` (`user_id`, `academic_year_id`, `requested_at`);
DROP INDEX `reward_redemptions_user_id_academic_year_id_key` ON `reward_redemptions`;
CREATE UNIQUE INDEX `reward_redemptions_request_id_key` ON `reward_redemptions` (`request_id`);
