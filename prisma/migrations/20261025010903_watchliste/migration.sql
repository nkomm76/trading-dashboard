-- CreateTable
CREATE TABLE `WatchItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `symbol` VARCHAR(32) NOT NULL,
    `isin` VARCHAR(12) NULL,
    `name` VARCHAR(255) NOT NULL,
    `currency` VARCHAR(8) NOT NULL,
    `light` ENUM('GREEN', 'ORANGE', 'RED', 'GREY') NULL,
    `summary` JSON NULL,
    `checkedAt` DATETIME(3) NULL,
    `error` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `WatchItem_symbol_key`(`symbol`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
