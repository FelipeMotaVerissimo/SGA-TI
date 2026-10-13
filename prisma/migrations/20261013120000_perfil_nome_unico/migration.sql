-- Torna o nome do perfil unico.
--
-- Antes desta restricao o banco aceitava dois perfis ADMINISTRADOR. Com perfil
-- duplicado, parte dos usuarios aponta para um e parte para o outro, e o
-- controle de acesso (RF022/RF023) fica imprevisivel.
--
-- ATENCAO ao aplicar num banco que ja esta em uso: se houver nome repetido em
-- `perfis`, esta migration FALHA. Conferir antes com:
--   SELECT nomePerfil, COUNT(*) FROM perfis GROUP BY nomePerfil HAVING COUNT(*) > 1;

-- CreateIndex
CREATE UNIQUE INDEX `perfis_nomePerfil_key` ON `perfis`(`nomePerfil`);

