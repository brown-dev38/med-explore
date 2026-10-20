CREATE TABLE `microsoft_accounts` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `tenant_id` VARCHAR(36) NOT NULL,
    `object_id` VARCHAR(36) NOT NULL,
    `label` VARCHAR(191) NULL,
    `linked_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `microsoft_accounts_user_id_key`(`user_id`),
    UNIQUE INDEX `microsoft_accounts_tenant_id_object_id_key`(`tenant_id`, `object_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `microsoft_accounts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `microsoft_link_intents` (
    `id` CHAR(64) NOT NULL,
    `user_id` BIGINT NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    INDEX `microsoft_link_intents_user_id_idx`(`user_id`),
    INDEX `microsoft_link_intents_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`),
    CONSTRAINT `microsoft_link_intents_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
