/*
  Warnings:

  - You are about to drop the column `email` on the `usuarios` table. All the data in the column will be lost.
  - You are about to drop the column `perfil` on the `usuarios` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[login]` on the table `usuarios` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `login` to the `usuarios` table without a default value. This is not possible if the table is not empty.
  - Added the required column `perfilId` to the `usuarios` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX `usuarios_email_key` ON `usuarios`;

-- AlterTable
ALTER TABLE `usuarios` DROP COLUMN `email`,
    DROP COLUMN `perfil`,
    ADD COLUMN `login` VARCHAR(100) NOT NULL,
    ADD COLUMN `perfilId` INTEGER NOT NULL;

-- CreateTable
CREATE TABLE `perfis` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nomePerfil` VARCHAR(50) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `usuarios_login_key` ON `usuarios`(`login`);

-- AddForeignKey
ALTER TABLE `usuarios` ADD CONSTRAINT `usuarios_perfilId_fkey` FOREIGN KEY (`perfilId`) REFERENCES `perfis`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
