-- AlterTable
ALTER TABLE `clientes` ADD COLUMN `anonimizadoEm` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `equipamentos` ADD COLUMN `ativo` BOOLEAN NOT NULL DEFAULT true;

