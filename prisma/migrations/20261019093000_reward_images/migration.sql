ALTER TABLE `reward_tiers`
  ADD COLUMN `image_data` MEDIUMBLOB NULL,
  ADD COLUMN `image_mime_type` VARCHAR(50) NULL,
  ADD COLUMN `image_updated_at` DATETIME(3) NULL;
