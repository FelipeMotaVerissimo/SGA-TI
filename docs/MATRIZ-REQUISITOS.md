# Matriz de rastreabilidade de requisitos

**Versão:** V01 · 12/10/2026
**Commit medido:** `923acea`
**Suíte de referência:** 424 testes unitários + 385 de integração (809 no total, todos passando)

---

## 0. Limitação deste documento

> **A monografia não estava disponível.** O arquivo `sandbox/tcc.html`, apontado
> como "o documento", é um painel de acompanhamento de 04/08/2026 e não contém a
> lista numerada de requisitos (ver `docs/DIVERGENCIAS-DOC.md`, seção 0).

Consequência prática para esta matriz:

| Situação | Quantos | Como foi tratado |
|---|---|---|
| Requisito **citado no código ou nos LEIAMEs**, com enunciado conhecido | 16 RF + 5 NF | Enunciado transcrito como aparece no projeto |
| Requisito cujo número é conhecido, mas **o enunciado não** | 7 RF + 3 NF | Marcado `[VALIDAR]`, com a funcionalidade correspondente **inferida** e identificada como inferência |

**Nada foi inventado.** Onde o enunciado não era conhecido, está escrito que não
era conhecido. Onde não há teste, está escrito que não há.

---

## 1. Legenda

| Status | Significado |
|---|---|
| ✅ **Completo** | Implementado e com teste automatizado que exercita a regra |
| ⚠️ **Sem teste** | Implementado, mas sem teste automatizado que o cubra diretamente |
| 🔶 **Parcial** | Implementado em parte, com lacuna registrada |
| ❌ **Não implementado** | Previsto e ausente |
| ❓ **A validar** | Enunciado desconhecido — depende da monografia |

---

## 2. Requisitos funcionais

### 2.1 Módulos 1 e 2 — enunciados não disponíveis

> `[VALIDAR: RF001, RF002, RF003, RF005, RF009, RF010 e RF011 não aparecem
> citados em nenhum comentário do código nem nos LEIAMEs, ao contrário dos
> demais.]` São, muito provavelmente, os Módulos 1 e 2 — implementados pelo
> Felipe antes de a convenção de marcar o RF no comentário existir. A coluna
> "funcionalidade correspondente" abaixo é **inferência a partir do que o sistema
> faz**, não transcrição do documento.

| ID | Funcionalidade correspondente (inferida) | Onde está | Teste que cobre | Status |
|---|---|---|---|---|
| RF001 | ❓ Autenticação de usuário (login com sessão) | `authWebController.realizarLogin`, `sessaoMiddleware` | `perfis.test.js` (login em todos os cenários), `seguranca.test.js` (cookie da sessão) | ❓ a validar |
| RF002 | ❓ Cadastro de clientes | `clienteService`, telas `/clientes` | `unit/clienteService.test.js` (5), `clientes.test.js` (7, via API) | ❓ a validar |
| RF003 | ❓ Cadastro de equipamentos | `equipamentoService`, telas `/equipamentos` | `unit/equipamentoService.test.js` (validação de tipo) | ❓ a validar |
| RF005 | ❓ Cadastro de usuários | `usuarioWebController`, `authService.criarUsuario` | `api.test.js` — criação restrita ao administrador | ❓ a validar |
| RF009 | ❓ Abertura de ordem de serviço | `ordemServicoService.abrirOrdem` | `unit/ordemServicoService.test.js` — OS nasce `INICIAL` | ❓ a validar |
| RF010 | ❓ Atualização de status da OS | `ordemServicoService.atualizarStatus` | `unit/ordemServicoService.test.js`, `garantia.test.js` | ❓ a validar |
| RF011 | ❓ Consulta pública de OS pelo número | `ordemServicoWeb.consultaPublica`, `/consulta` | `garantia.test.js` — consulta com número válido e inexistente | ❓ a validar |

### 2.2 Requisitos com enunciado conhecido

| ID | Enunciado (como citado no projeto) | Onde está | Teste que cobre | Status |
|---|---|---|---|---|
| **RF004** | Excluir cliente — **só administrador** (UC RF004) | `clienteService.excluirCliente`; rota `POST /clientes/:id/excluir` com `exigirPerfil()` | `clientes.test.js` (API) e `perfis.test.js` — administrador desativa, os cinco perfis são barrados mesmo por POST direto, e sem sessão nada muda | ✅ completo |
| **RF006** | Controlar Produtos/Estoques — cadastro → entrada → saída na OS (UC) | `produtoService`, `itemOrdemService`, telas `/produtos` | `unit/produtoService.test.js` (34), `unit/itemOrdemService.test.js` (29), `estoque.test.js` (16) | ✅ completo |
| **RF007** | Controlar Financeiro — contas a pagar/receber com quitação e cancelamento (UC) | `financeiroService`, telas `/financeiro` | `unit/financeiroService.test.js` (30), `financeiro.test.js` (15) | ✅ completo |
| **RF008** | Emitir Relatórios — por período, com filtros, **exibido ou exportado** (UC) | `relatorioService`, `csvService`, tela `/relatorios` | `unit/relatorioService.test.js` (18), `unit/csvService.test.js` (12), `relatorios.test.js` (17), `dashboard.test.js` (CSV) | ✅ completo |
| **RF012** | Histórico de serviços por equipamento | `equipamentoService.historicoDeServicos`, tela `/equipamentos/:id/historico` | `unit/equipamentoService.test.js` (10), `historicoEquipamento.test.js` (14) | ✅ completo |
| **RF013** | Controle de garantia | `servicoExecutadoService.calcularGarantia` | `unit/servicoExecutadoService.test.js` (21), `garantia.test.js` (13), `servicoTecnicoPeca.test.js` (11) | ✅ completo |
| **RF014** | Cadastro de produtos utilizados nos serviços | `produtoService`, telas `/produtos` | `unit/produtoService.test.js`, `estoque.test.js`, `api.test.js` | ✅ completo |
| **RF015** | Entrada de produtos no estoque **pelo setor de Compras** | `produtoService.movimentarEstoque`, tela `/produtos/:id/estoque` | `estoque.test.js`, `perfis.test.js` — VENDEDOR não movimenta por POST direto | ✅ completo |
| **RF016** | Maiores clientes por período | `relatorioService.maioresClientes` | `unit/relatorioService.test.js`, `relatorios.test.js` | ✅ completo |
| **RF017** | Serviços mais executados por período | `relatorioService.servicosMaisExecutados`, `tipoServicoService` | `tiposServico.test.js` (18) | ✅ completo |
| **RF018** | Produtos mais vendidos | `relatorioService.produtosMaisVendidos` | `unit/relatorioService.test.js`, `relatorios.test.js` | ✅ completo |
| **RF019** | Serviços e produtos vendidos por tipo de equipamento | `relatorioService.porTipoDeEquipamento` | `tiposServico.test.js` | ✅ completo |
| **RF020** | Registro de contas a pagar | `financeiroService` | `unit/financeiroService.test.js`, `financeiro.test.js` | ✅ completo |
| **RF021** | Registro de contas a receber | `financeiroService`; geração automática no encerramento da OS | `unit/financeiroService.test.js`, `financeiro.test.js`, `unit/ordemServicoService.test.js` (conta gerada em transação) | ✅ completo |
| **RF022** | Usuários com níveis de acesso | `perfilMiddleware`, model `Perfil` | `perfis.test.js` (19), `api.test.js` (32) | ✅ completo |
| **RF023** | Permissões específicas por perfil | `exigirPerfil` / `exigirPerfilApi`, rota a rota em `webRoutes.js` | `perfis.test.js`, `api.test.js`, `auditoria.test.js`, `retencao.test.js` | ✅ completo |

---

## 3. Requisitos não funcionais

| ID | Enunciado | Onde está | Teste que cobre | Status |
|---|---|---|---|---|
| **NF001** | `[VALIDAR: não citado no plano nem no código]` | — | — | ❓ a validar |
| **NF002** | `[VALIDAR: idem]` | — | — | ❓ a validar |
| **NF003** | `[VALIDAR: idem]` | — | — | ❓ a validar |
| **NF004** | Análise geográfica | `relatorioService.porRegiao`, bloco 🗺️ em `/relatorios` e exportação CSV | `unit/relatorioService.test.js` (8 casos), `relatorios.test.js` (4 casos) | ✅ completo |
| **NF005** | Rastreabilidade (log de auditoria) | `auditoriaExtensao`, `contextoRequisicao`, tela `/auditoria`, tabela `logs_auditoria` | `unit/auditoriaExtensao.test.js` (15), `auditoria.test.js` (22) | ✅ completo |
| **NF006** | Backup | `scripts/backup.js`, `npm run backup`, `scripts/conferir-restauracao.sh`, `docs/BACKUP.md` | `unit/backup.test.js` (15) cobre URL, nome e argumentos; o **ciclo dump → restauração roda no CI a cada push**, comparando tabela a tabela | ✅ completo |
| **NF007** | Segurança na comunicação | `src/config/seguranca.js` — CSP, HSTS, HTTPS, cookie, CORS, limite de login e da consulta pública; `src/middlewares/csrfMiddleware.js` — token CSRF | `unit/seguranca.test.js` (27), `unit/csrf.test.js` (22), `seguranca.test.js` (23), `csrf.test.js` (16) | 🔶 parcial |
| **NF008** | Retenção e descarte (LGPD) | `retencaoService`, `clientes.anonimizadoEm`, `equipamentos.ativo`, `scripts/reparar-anonimizacoes.js`, `docs/RETENCAO.md` | `retencao.test.js` (34), `unit/retencaoService.test.js` (12) | 🔶 parcial |

### Por que NF006, NF007 e NF008 são parciais

| ID | O que falta | Onde está registrado |
|---|---|---|
| ~~NF006~~ | ~~O ciclo nunca foi executado~~ — **resolvido**: roda no CI, que tem `mysqldump` e MySQL | `docs/BACKUP.md`, seção 5 |
| NF007 | `'unsafe-inline'` em `style-src` (o de `script-src` **saiu** em 15/10/2026) e o comportamento sob HTTPS real nunca foi exercitado. O limite de tentativas de login e o token CSRF **foram implementados** — ver `docs/SEGURANCA.md`, seções 4.1 e 4.2 | `docs/SEGURANCA.md`, seção 7 |
| NF008 | O **descarte** está completo: a anonimização alcança o cadastro, a descrição das contas geradas no faturamento e o log de auditoria, e há reparo para anonimizações antigas. O que falta é a **retenção**: os prazos da seção 5 do `RETENCAO.md` são proposta, e nenhuma rotina os aplica automaticamente. Também não há registro de consentimento | `docs/RETENCAO.md`, seções 3.3 e 7 |

---

## 4. Requisitos sem teste automatizado

> Esta seção existe porque o plano pede que a ausência de teste seja dita
> abertamente, em vez de preenchida.

| ID | O que não tem teste | Gravidade | Comentário |
|---|---|---|---|
| ~~RF004~~ | ~~A rota web e sua trava de administrador~~ | — | **Resolvido**: 7 casos novos em `perfis.test.js` cobrem o administrador desativando, os cinco perfis barrados por POST direto e o acesso sem sessão |
| ~~NF004~~ | ~~Não há teste porque não há implementação~~ | — | **Resolvido**: implementado e coberto por 12 casos |
| ~~NF006~~ | ~~O ciclo real de backup e restauração~~ | — | **Resolvido**: `scripts/conferir-restauracao.sh` roda no CI a cada push |
| **NF007** | Comportamento sob TLS de verdade | Média | A lógica está testada e o limite de tentativas de login **passou a ter cobertura** (3 casos). O que falta é o tráfego cifrado real |
| RF001–RF011 | Os sete requisitos de enunciado desconhecido têm testes que **provavelmente** os cobrem, mas a correspondência não pode ser afirmada sem o documento | — | Resolve-se com a monografia em mãos |

### Lacunas de teste que não são de requisito

Registradas em `docs/TESTES.md`, seção 1.6: renderização no navegador, HTTPS
real, carga e concorrência, e compatibilidade entre navegadores.

---

## 5. Resumo

### Requisitos funcionais

| Status | Quantidade |
|---|---|
| ✅ Completo | 16 |
| ⚠️ Implementado sem teste direto | 0 |
| ❓ A validar com a monografia | 7 |
| ❌ Não implementado | 0 |
| **Total** | **23** |

**Nenhum requisito funcional conhecido ficou sem implementação, e nenhum ficou sem teste.**

### Requisitos não funcionais

| Status | Quantidade |
|---|---|
| ✅ Completo | 3 (NF004, NF005, NF006) |
| 🔶 Parcial | 2 (NF007, NF008) |
| ❌ Não implementado | 0 |
| ❓ A validar | 3 (NF001–NF003) |
| **Total** | **8** |

### Cobertura por módulo

| Módulo | Requisitos | Testes dedicados |
|---|---|---|
| 1 — Base | RF001–RF005 (inferido) | `clienteService`, `clientes`, `equipamentoService`, `perfis` |
| 2 — Ordens de serviço | RF009–RF011 (inferido) | `ordemServicoService`, `garantia` (consulta pública) |
| 3 — Orçamento, serviços e garantia | RF012, RF013 | `servicoExecutadoService`, `garantia`, `historicoEquipamento` |
| 4 — Produtos, estoque, financeiro, perfis | RF006, RF007, RF014, RF015, RF020–RF023 | `produtoService`, `itemOrdemService`, `financeiroService`, `estoque`, `financeiro`, `perfis`, `api` |
| 5 — Relatórios | RF008, RF016–RF019, NF004 | `relatorioService`, `csvService`, `relatorios`, `tiposServico`, `dashboard` |
| NF005 — Auditoria | NF005 | `auditoriaExtensao`, `auditoria` |
| NF006–NF008 | NF006, NF007, NF008 | `backup`, `seguranca` (×2), `retencao` |

---

## 6. Como esta matriz se mantém verdadeira

Os números desta matriz foram conferidos arquivo por arquivo contra a execução
real da suíte, não estimados. Para refazer a conferência:

```cmd
npx jest --json --outputFile=resultados.json
```

O CI roda as duas suítes contra MySQL 8 a cada push, então **divergência entre
esta matriz e a realidade aparece no GitHub Actions antes de aparecer na banca**.
