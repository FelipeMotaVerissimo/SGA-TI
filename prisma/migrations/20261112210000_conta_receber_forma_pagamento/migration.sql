-- Forma de pagamento do recebimento (opcional; recebimentos anteriores ficam sem forma).

-- AlterTable
ALTER TABLE `contas_receber` ADD COLUMN `formaPagamento` VARCHAR(50) NULL;
