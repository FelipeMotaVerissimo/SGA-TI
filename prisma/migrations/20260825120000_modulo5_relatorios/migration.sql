-- AlterTable
ALTER TABLE `equipamentos` ADD COLUMN `tipo` ENUM('NOTEBOOK', 'DESKTOP', 'IMPRESSORA', 'SERVIDOR', 'CELULAR', 'OUTRO') NOT NULL DEFAULT 'OUTRO';

-- AlterTable
ALTER TABLE `servicos_executados` ADD COLUMN `tipoServicoId` INTEGER NULL;

-- AlterTable
ALTER TABLE `itens_ordem` ADD COLUMN `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- CreateTable
CREATE TABLE `tipos_servico` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(120) NOT NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `tipos_servico_nome_key`(`nome`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `servicos_executados` ADD CONSTRAINT `servicos_executados_tipoServicoId_fkey` FOREIGN KEY (`tipoServicoId`) REFERENCES `tipos_servico`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

