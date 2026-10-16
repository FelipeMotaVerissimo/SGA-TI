-- Modulo 6: rastreamento de entregas em mapa.
--
-- saidas_entrega    uma viagem do entregador
-- entregas_os       cada OS dentro da saida (uma parada)
-- posicoes_entrega  posicoes do entregador durante a saida
--
-- Duas regras ficam garantidas pelo proprio banco, com indice unico sobre uma
-- coluna que so tem valor enquanto a regra se aplica (o indice aceita varios
-- NULL):
--   saidas_entrega.emRota        = true enquanto EM_ROTA  -> uma saida em rota
--   entregas_os.ordemPendenteId  = ordemId enquanto PENDENTE -> OS em uma so
--                                  entrega pendente
-- Assim, dois cliques simultaneos em "Iniciar saida" nao criam duas saidas.
--
-- Chaves estrangeiras RESTRICT, como no resto do projeto. Tabelas novas, nenhum
-- dado existente e alterado.

-- CreateTable
CREATE TABLE `saidas_entrega` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `status` ENUM('EM_ROTA', 'CONCLUIDA', 'CANCELADA') NOT NULL DEFAULT 'EM_ROTA',
    `emRota` BOOLEAN NULL DEFAULT true,
    `iniciadaEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `encerradaEm` DATETIME(3) NULL,
    `entregadorId` INTEGER NOT NULL,

    UNIQUE INDEX `saidas_entrega_emRota_key`(`emRota`),
    INDEX `saidas_entrega_entregadorId_idx`(`entregadorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `entregas_os` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ordemParada` INTEGER NOT NULL,
    `status` ENUM('PENDENTE', 'ENTREGUE', 'NAO_ENTREGUE') NOT NULL DEFAULT 'PENDENTE',
    `ordemPendenteId` INTEGER NULL,
    `destinoLat` DECIMAL(9, 6) NULL,
    `destinoLng` DECIMAL(9, 6) NULL,
    `tokenHash` VARCHAR(64) NULL,
    `motivo` VARCHAR(200) NULL,
    `entregueEm` DATETIME(3) NULL,
    `saidaId` INTEGER NOT NULL,
    `ordemId` INTEGER NOT NULL,

    UNIQUE INDEX `entregas_os_ordemPendenteId_key`(`ordemPendenteId`),
    UNIQUE INDEX `entregas_os_tokenHash_key`(`tokenHash`),
    INDEX `entregas_os_ordemId_idx`(`ordemId`),
    UNIQUE INDEX `entregas_os_saidaId_ordemId_key`(`saidaId`, `ordemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `posicoes_entrega` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `lat` DECIMAL(9, 6) NOT NULL,
    `lng` DECIMAL(9, 6) NOT NULL,
    `precisao` DOUBLE NULL,
    `registradaEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `saidaId` INTEGER NOT NULL,

    INDEX `posicoes_entrega_saidaId_registradaEm_idx`(`saidaId`, `registradaEm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `saidas_entrega` ADD CONSTRAINT `saidas_entrega_entregadorId_fkey` FOREIGN KEY (`entregadorId`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `entregas_os` ADD CONSTRAINT `entregas_os_saidaId_fkey` FOREIGN KEY (`saidaId`) REFERENCES `saidas_entrega`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `entregas_os` ADD CONSTRAINT `entregas_os_ordemId_fkey` FOREIGN KEY (`ordemId`) REFERENCES `ordens_servico`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `posicoes_entrega` ADD CONSTRAINT `posicoes_entrega_saidaId_fkey` FOREIGN KEY (`saidaId`) REFERENCES `saidas_entrega`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

