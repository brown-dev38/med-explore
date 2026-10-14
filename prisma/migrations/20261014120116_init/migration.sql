-- CreateTable
CREATE TABLE `users` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `student_code` VARCHAR(50) NULL,
    `username` TEXT NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(255) NULL,
    `firstname` TEXT NULL,
    `lastname` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_student_code_key`(`student_code`),
    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `description` VARCHAR(255) NULL,

    UNIQUE INDEX `roles_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(100) NOT NULL,
    `description` VARCHAR(255) NULL,

    UNIQUE INDEX `permissions_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `user_id` BIGINT NOT NULL,
    `role_id` BIGINT NOT NULL,

    INDEX `user_roles_role_id_idx`(`role_id`),
    PRIMARY KEY (`user_id`, `role_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `role_id` BIGINT NOT NULL,
    `permission_id` BIGINT NOT NULL,

    INDEX `role_permissions_permission_id_idx`(`permission_id`),
    PRIMARY KEY (`role_id`, `permission_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `academic_years` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `starts_on` DATE NOT NULL,
    `ends_on` DATE NOT NULL,
    `status` ENUM('DRAFT', 'ACTIVE', 'CLOSED') NOT NULL DEFAULT 'DRAFT',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `academic_years_code_key`(`code`),
    INDEX `academic_years_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activities` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `academic_year_id` BIGINT NOT NULL,
    `organizer_id` BIGINT NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `location` VARCHAR(191) NULL,
    `starts_at` DATETIME(3) NOT NULL,
    `ends_at` DATETIME(3) NOT NULL,
    `min_minutes` INTEGER NOT NULL DEFAULT 90,
    `status` ENUM('DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `activities_academic_year_id_status_idx`(`academic_year_id`, `status`),
    INDEX `activities_starts_at_idx`(`starts_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `participations` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `activity_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `status` ENUM('REGISTERED', 'ATTENDED', 'INCOMPLETE', 'ABSENT') NOT NULL DEFAULT 'REGISTERED',
    `eligibility_status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `attended_minutes` INTEGER NULL,
    `review_due_at` DATETIME(3) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `reviewed_by` BIGINT NULL,
    `review_note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `participations_user_id_eligibility_status_idx`(`user_id`, `eligibility_status`),
    INDEX `participations_eligibility_status_review_due_at_idx`(`eligibility_status`, `review_due_at`),
    UNIQUE INDEX `participations_activity_id_user_id_key`(`activity_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_records` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `participation_id` BIGINT NOT NULL,
    `event_type` ENUM('CHECK_IN', 'CHECK_OUT') NOT NULL,
    `method` ENUM('QR', 'ORGANIZER') NOT NULL,
    `occurred_at` DATETIME(3) NOT NULL,
    `recorded_by` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `attendance_records_occurred_at_idx`(`occurred_at`),
    UNIQUE INDEX `attendance_records_participation_id_event_type_key`(`participation_id`, `event_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `helper_assignments` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `activity_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `assigned_by` BIGINT NOT NULL,
    `status` ENUM('ASSIGNED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'ASSIGNED',
    `description` TEXT NULL,
    `completed_at` DATETIME(3) NULL,
    `review_due_at` DATETIME(3) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `helper_assignments_user_id_status_idx`(`user_id`, `status`),
    UNIQUE INDEX `helper_assignments_activity_id_user_id_key`(`activity_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `star_transactions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `academic_year_id` BIGINT NOT NULL,
    `participation_id` BIGINT NULL,
    `helper_assignment_id` BIGINT NULL,
    `redemption_id` BIGINT NULL,
    `star_type` ENUM('YELLOW', 'GREEN', 'ADJUSTMENT') NOT NULL,
    `points` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `reason` TEXT NULL,
    `approved_by` BIGINT NULL,
    `approved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `star_transactions_redemption_id_key`(`redemption_id`),
    INDEX `star_transactions_user_id_academic_year_id_status_idx`(`user_id`, `academic_year_id`, `status`),
    INDEX `star_transactions_academic_year_id_star_type_status_idx`(`academic_year_id`, `star_type`, `status`),
    UNIQUE INDEX `star_transactions_participation_id_star_type_key`(`participation_id`, `star_type`),
    UNIQUE INDEX `star_transactions_helper_assignment_id_star_type_key`(`helper_assignment_id`, `star_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reward_tiers` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `academic_year_id` BIGINT NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `cost_points` INTEGER NOT NULL,
    `stock_quantity` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `reward_tiers_academic_year_id_is_active_cost_points_idx`(`academic_year_id`, `is_active`, `cost_points`),
    UNIQUE INDEX `reward_tiers_academic_year_id_name_key`(`academic_year_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reward_redemptions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `academic_year_id` BIGINT NOT NULL,
    `reward_tier_id` BIGINT NOT NULL,
    `cost_points` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `requested_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `redeemed_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `note` TEXT NULL,

    INDEX `reward_redemptions_academic_year_id_status_idx`(`academic_year_id`, `status`),
    UNIQUE INDEX `reward_redemptions_user_id_academic_year_id_key`(`user_id`, `academic_year_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qr_sessions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `activity_id` BIGINT NOT NULL,
    `created_by` BIGINT NOT NULL,
    `purpose` ENUM('CHECK_IN', 'CHECK_OUT') NOT NULL,
    `token_hash` VARCHAR(255) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `qr_sessions_token_hash_key`(`token_hash`),
    INDEX `qr_sessions_activity_id_purpose_expires_at_idx`(`activity_id`, `purpose`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `survey_responses` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `activity_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `answers` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `survey_responses_activity_id_user_id_key`(`activity_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `actor_id` BIGINT NULL,
    `action` VARCHAR(100) NOT NULL,
    `entity_type` VARCHAR(100) NOT NULL,
    `entity_id` BIGINT NULL,
    `details` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    INDEX `audit_logs_actor_id_created_at_idx`(`actor_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activities` ADD CONSTRAINT `activities_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activities` ADD CONSTRAINT `activities_organizer_id_fkey` FOREIGN KEY (`organizer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `participations` ADD CONSTRAINT `participations_activity_id_fkey` FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `participations` ADD CONSTRAINT `participations_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_participation_id_fkey` FOREIGN KEY (`participation_id`) REFERENCES `participations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_recorded_by_fkey` FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `helper_assignments` ADD CONSTRAINT `helper_assignments_activity_id_fkey` FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `helper_assignments` ADD CONSTRAINT `helper_assignments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `helper_assignments` ADD CONSTRAINT `helper_assignments_assigned_by_fkey` FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `star_transactions` ADD CONSTRAINT `star_transactions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `star_transactions` ADD CONSTRAINT `star_transactions_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `star_transactions` ADD CONSTRAINT `star_transactions_participation_id_fkey` FOREIGN KEY (`participation_id`) REFERENCES `participations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `star_transactions` ADD CONSTRAINT `star_transactions_helper_assignment_id_fkey` FOREIGN KEY (`helper_assignment_id`) REFERENCES `helper_assignments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `star_transactions` ADD CONSTRAINT `star_transactions_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `star_transactions` ADD CONSTRAINT `star_transactions_redemption_id_fkey` FOREIGN KEY (`redemption_id`) REFERENCES `reward_redemptions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reward_tiers` ADD CONSTRAINT `reward_tiers_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reward_redemptions` ADD CONSTRAINT `reward_redemptions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reward_redemptions` ADD CONSTRAINT `reward_redemptions_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reward_redemptions` ADD CONSTRAINT `reward_redemptions_reward_tier_id_fkey` FOREIGN KEY (`reward_tier_id`) REFERENCES `reward_tiers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qr_sessions` ADD CONSTRAINT `qr_sessions_activity_id_fkey` FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qr_sessions` ADD CONSTRAINT `qr_sessions_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `survey_responses` ADD CONSTRAINT `survey_responses_activity_id_fkey` FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `survey_responses` ADD CONSTRAINT `survey_responses_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
