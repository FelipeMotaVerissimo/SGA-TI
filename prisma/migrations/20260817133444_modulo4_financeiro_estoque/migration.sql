-- AlterTable
ALTER TABLE `clientes` ADD COLUMN `bairro` VARCHAR(100) NULL;

-- AlterTable
ALTER TABLE `movimentos_estoque` ADD COLUMN `usuarioId` INTEGER NULL;

-- CreateTable
CREATE TABLE `contas_pagar` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `descricao` VARCHAR(200) NOT NULL,
    `fornecedor` VARCHAR(150) NULL,
    `valor` DECIMAL(10, 2) NOT NULL,
    `vencimento` DATETIME(3) NOT NULL,
    `situacao` ENUM('ABERTA', 'PAGA', 'CANCELADA') NOT NULL DEFAULT 'ABERTA',
    `quitadaEm` DATETIME(3) NULL,
    `observacoes` TEXT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `quitadaPorId` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contas_receber` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `descricao` VARCHAR(200) NOT NULL,
    `valor` DECIMAL(10, 2) NOT NULL,
    `vencimento` DATETIME(3) NOT NULL,
    `situacao` ENUM('ABERTA', 'PAGA', 'CANCELADA') NOT NULL DEFAULT 'ABERTA',
    `quitadaEm` DATETIME(3) NULL,
    `observacoes` TEXT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ordemId` INTEGER NULL,
    `clienteId` INTEGER NULL,
    `quitadaPorId` INTEGER NULL,

    UNIQUE INDEX `contas_receber_ordemId_key`(`ordemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `movimentos_estoque` ADD CONSTRAINT `movimentos_estoque_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contas_pagar` ADD CONSTRAINT `contas_pagar_quitadaPorId_fkey` FOREIGN KEY (`quitadaPorId`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contas_receber` ADD CONSTRAINT `contas_receber_ordemId_fkey` FOREIGN KEY (`ordemId`) REFERENCES `ordens_servico`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contas_receber` ADD CONSTRAINT `contas_receber_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `clientes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contas_receber` ADD CONSTRAINT `contas_receber_quitadaPorId_fkey` FOREIGN KEY (`quitadaPorId`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

