-- CreateTable
CREATE TABLE `logs_auditoria` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entidade` VARCHAR(60) NOT NULL,
    `registroId` INTEGER NULL,
    `acao` ENUM('LEITURA', 'INCLUSAO', 'ALTERACAO', 'EXCLUSAO') NOT NULL,
    `valorAnterior` TEXT NULL,
    `valorNovo` TEXT NULL,
    `ip` VARCHAR(45) NULL,
    `usuarioId` INTEGER NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `logs_auditoria_criadoEm_idx`(`criadoEm`),
    INDEX `logs_auditoria_entidade_registroId_idx`(`entidade`, `registroId`),
    INDEX `logs_auditoria_usuarioId_idx`(`usuarioId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `logs_auditoria` ADD CONSTRAINT `logs_auditoria_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

