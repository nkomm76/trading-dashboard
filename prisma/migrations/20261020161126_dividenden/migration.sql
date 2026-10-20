-- CreateTable
CREATE TABLE `Dividend` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stockId` INTEGER NOT NULL,
    `exDate` DATE NOT NULL,
    `status` ENUM('CONFIRMED', 'DISMISSED') NOT NULL DEFAULT 'CONFIRMED',
    `quantity` DECIMAL(18, 6) NULL,
    `perShare` DECIMAL(18, 6) NULL,
    `grossEur` DECIMAL(18, 2) NULL,
    `netEur` DECIMAL(18, 2) NULL,
    `note` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Dividend_stockId_exDate_key`(`stockId`, `exDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Dividend` ADD CONSTRAINT `Dividend_stockId_fkey` FOREIGN KEY (`stockId`) REFERENCES `Stock`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
