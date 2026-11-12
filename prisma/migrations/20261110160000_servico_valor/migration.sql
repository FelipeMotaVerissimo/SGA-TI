-- Valor cobrado pelo servico (opcional; servicos anteriores ficam sem valor).

-- AlterTable
ALTER TABLE `servicos_executados` ADD COLUMN `valor` DECIMAL(10, 2) NULL;
