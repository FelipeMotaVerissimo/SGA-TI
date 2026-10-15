-- Backlog item 2: quem executou cada servico e em qual servico cada peca foi usada.
--
-- As duas colunas sao opcionais e NAO ha preenchimento retroativo: os servicos
-- e as pecas anteriores a esta migration nao tem o dado, e atribuir um tecnico
-- ou um servico a eles seria inventar. Aparecem como "Nao registrado" e
-- "Uso geral da OS".
--
-- ON DELETE RESTRICT de proposito: o vinculo da peca e desfeito pela aplicacao
-- antes de excluir o servico, para que a auditoria (NF005) registre a mudanca.

-- AlterTable
ALTER TABLE `servicos_executados` ADD COLUMN `usuarioId` INTEGER NULL;

-- AlterTable
ALTER TABLE `itens_ordem` ADD COLUMN `servicoId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `servicos_executados_usuarioId_idx` ON `servicos_executados`(`usuarioId`);

-- CreateIndex
CREATE INDEX `itens_ordem_servicoId_idx` ON `itens_ordem`(`servicoId`);

-- AddForeignKey
ALTER TABLE `servicos_executados` ADD CONSTRAINT `servicos_executados_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `itens_ordem` ADD CONSTRAINT `itens_ordem_servicoId_fkey` FOREIGN KEY (`servicoId`) REFERENCES `servicos_executados`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

