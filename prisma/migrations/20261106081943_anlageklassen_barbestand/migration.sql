/*
  Warnings:

  - You are about to alter the column `quantity` on the `Purchase` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,6)` to `Decimal(24,10)`.

*/
-- AlterTable
ALTER TABLE `Purchase` MODIFY `quantity` DECIMAL(24, 10) NOT NULL;

-- AlterTable
ALTER TABLE `Stock` ADD COLUMN `assetClass` ENUM('STOCK', 'ETF', 'CRYPTO') NOT NULL DEFAULT 'STOCK';

-- CreateTable
CREATE TABLE `CashBalance` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATE NOT NULL,
    `amount` DECIMAL(18, 2) NOT NULL,
    `note` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CashBalance_date_key`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
