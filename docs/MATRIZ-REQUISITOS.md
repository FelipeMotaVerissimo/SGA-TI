# Matriz de rastreabilidade de requisitos

**Versão:** V03 · 04/11/2026 (V02 de 19/10/2026; V01 de 12/10/2026, antes do Módulo 6)
**Base de enunciados:** monografia, versão 0.0.8 (PDF de 25/08/2026), capítulo 2
**Suíte de referência:** 443 testes unitários + 413 de integração (856 no total, todos passando)

---

## 0. De onde vêm os enunciados

Até a V02 a monografia não estava disponível, e os enunciados de RF001–RF011 e
NF001–NF003 foram **inferidos** do que o sistema faz. Em 04/11/2026 ela foi
localizada e lida. A V03 troca a inferência pelo texto do documento:

- **RF001–RF023 e NF001–NF004** agora usam o enunciado e o número **da
  monografia** (seção 2.2).
- **RF024–RF028 e NF009** (Módulo 6) e **NF005–NF008** (auditoria, backup,
  transporte, retenção) **não existem na monografia 0.0.8**: foram criados pela
  dupla depois dela e entram na versão seguinte do texto. A numeração é a que
  este projeto vem usando e segue como proposta da dupla.
- A V02 acertou RF012–RF023, mas **errou RF001–RF011**: a inferência trocou
  quase todos de lugar (a monografia só trata login e usuários em RF022/RF023 e
  NF002, e a consulta pública em UC005).

> **Duas séries com o mesmo prefixo.** A monografia usa "RF" para os
> **requisitos** (seção 2.2, RF001–RF023) e também para os **casos de uso
> gerais** (seção 2.3.1, "RF001 — Controlar clientes" até "RF008 — Emitir
> relatórios"). Os números se repetem com sentidos diferentes. Neste projeto,
> os casos de uso gerais aparecem como **UC RF00x** (como já estavam nos
> comentários do código e nos LEIAMEs) e os específicos como **UC001–UC009**
> (seção 2.4 da monografia). Decisão de 04/11/2026: a numeração da monografia
> foi **mantida**; os casos de uso gerais seguem como UC RF00x.

Também ficou claro que um comentário antigo do código estava errado: "UC RF004
— só administrador" para excluir cliente. Na monografia, **excluir cliente é o
UC009**; o UC RF004 é "Controlar orçamentos". Os comentários e o teste foram
corrigidos nesta versão.

**Nada foi inventado.** Onde não há teste, está escrito que não há.

---

## 1. Legenda

| Status | Significado |
|---|---|
| ✅ **Completo** | Implementado e com teste automatizado que exercita a regra |
| ⚠️ **Sem teste** | Implementado, mas sem teste automatizado que o cubra diretamente |
| 🔶 **Parcial** | Implementado em parte, com lacuna registrada |
| ❌ **Não implementado** | Previsto e ausente |
| ❓ **A validar** | Depende de decisão ou confirmação (marcado `[VALIDAR]` no texto) |

---

## 2. Requisitos funcionais

### 2.1 RF001 a RF011 — Módulos 1 a 3 (enunciados da monografia, seção 2.2)

| ID | Enunciado (monografia) | Onde está | Teste que cobre | Status |
|---|---|---|---|---|
| **RF001** | Cadastro de clientes: nome, CPF/CNPJ, RG, data de nascimento, endereço, número, cidade, estado, CEP, telefone, celular e e-mail | model `Cliente` (tem todos os campos, mais `bairro`), `clienteService.criarCliente`, telas `/clientes` | `unit/clienteService.test.js` (cria; recusa CPF duplicado), `clientes.test.js` (POST com sucesso e CPF duplicado). Cada campo não é verificado um a um | ✅ completo |
| **RF002** | Consulta, edição e atualização dos dados dos clientes | `clienteService`, telas `/clientes` e `/clientes/:id` | `clientes.test.js` (lista, busca por id, PUT), `unit/clienteService.test.js` (id inexistente) | ✅ completo |
| **RF003** | Cadastro de equipamentos: código, marca, modelo, número de série e defeito informado | model `Equipamento` (tem os cinco campos, mais `tipo`), `equipamentoService.criarEquipamento`, telas `/equipamentos` | `tiposServico.test.js` (criação pela tela), `unit/equipamentoService.test.js` (validação do tipo). Não há teste que confira o número de série | ✅ completo |
| **RF004** | Vincular um equipamento a um cliente já cadastrado | `Equipamento.clienteId` (obrigatório, chave estrangeira `RESTRICT`); o formulário escolhe o cliente | `tiposServico.test.js`, `historicoEquipamento.test.js`, `fixture.js` | ✅ completo |
| **RF005** | Abertura de OS vinculada ao cliente e ao equipamento | `ordemServicoService.abrirOrdem`; a OS aponta para o equipamento e, por ele, para o cliente | `unit/ordemServicoService.test.js` (OS nasce `INICIAL`), `fixture.js` | ✅ completo |
| **RF006** | Registrar o defeito informado pelo cliente na abertura da OS | `OrdemServico.defeitoRelatado` (coluna obrigatória) | `unit/ordemServicoService.test.js` abre OS com defeito. **Não há teste que tente abrir sem defeito** | ⚠️ sem teste direto |
| **RF007** | Controlar o andamento por seis status: inicial, orçamento, autorizado, em andamento, cancelado, finalizado | `enum StatusOS`, `ordemServicoService.atualizarStatus` e as travas de transição | `unit/ordemServicoService.test.js`, `garantia.test.js`, `servicoExecutadoService.test.js` | ✅ completo |
| **RF008** | Registrar o valor do orçamento | `ordemServicoService.registrarOrcamento`, `validarValorOrcamento` | `unit/ordemServicoService.test.js` (valor com ponto ou vírgula, exige status `ORCAMENTO`, não altera OS já autorizada) | ✅ completo |
| **RF009** | Registrar a data de aprovação do orçamento | `ordemServicoService.aprovarOrcamento` | `unit/ordemServicoService.test.js` (aprova e grava a data; não a apaga quando o formulário não a envia) | ✅ completo |
| **RF010** | Registrar a previsão de entrega | `OrdemServico.previsaoEntrega`, `parseDataLocal` | `unit/ordemServicoService.test.js` (data `AAAA-MM-DD` sem perder um dia) | ✅ completo |
| **RF011** | O técnico registra os serviços executados | `servicoExecutadoService.registrarServico`, bloco "Serviços" em `/ordens/:id` | `unit/servicoExecutadoService.test.js` (21), `garantia.test.js` (13), `servicoTecnicoPeca.test.js` (11) | ✅ completo |

### 2.2 RF012 a RF023 — Módulos 3 a 5

| ID | Enunciado (monografia) | Onde está | Teste que cobre | Status |
|---|---|---|---|---|
| **RF012** | Manter histórico de serviços por equipamento | `equipamentoService.historicoDeServicos`, tela `/equipamentos/:id/historico` | `unit/equipamentoService.test.js` (10), `historicoEquipamento.test.js` (14) | ✅ completo |
| **RF013** | Controle de garantia dos serviços | `servicoExecutadoService.calcularGarantia` | `unit/servicoExecutadoService.test.js` (21), `garantia.test.js` (13), `servicoTecnicoPeca.test.js` (11) | ✅ completo |
| **RF014** | Cadastro de produtos utilizados nos serviços | `produtoService`, telas `/produtos` | `unit/produtoService.test.js`, `estoque.test.js`, `api.test.js` | ✅ completo |
| **RF015** | Entrada de produtos no estoque pelo setor de Compras | `produtoService.movimentarEstoque`, tela `/produtos/:id/estoque` | `estoque.test.js`, `perfis.test.js` — VENDEDOR não movimenta por POST direto | ✅ completo |
| **RF016** | Relatório de maiores clientes por período | `relatorioService.maioresClientes` | `unit/relatorioService.test.js`, `relatorios.test.js` | ✅ completo |
| **RF017** | Relatório de serviços mais executados por período | `relatorioService.servicosMaisExecutados`, `tipoServicoService` | `tiposServico.test.js` (18) | ✅ completo |
| **RF018** | Relatório de produtos mais vendidos | `relatorioService.produtosMaisVendidos` | `unit/relatorioService.test.js`, `relatorios.test.js` | ✅ completo |
| **RF019** | Relatório de serviços e produtos vendidos por tipo de equipamento | `relatorioService.porTipoDeEquipamento` | `tiposServico.test.js` | ✅ completo |
| **RF020** | Registro de contas a pagar | `financeiroService` | `unit/financeiroService.test.js`, `financeiro.test.js` | ✅ completo |
| **RF021** | Registro de contas a receber | `financeiroService`; geração automática no encerramento da OS | `unit/financeiroService.test.js`, `financeiro.test.js`, `unit/ordemServicoService.test.js` (conta gerada em transação) | ✅ completo |
| **RF022** | Cadastro de usuários com diferentes níveis de acesso | `usuarioWebController`, `authService.criarUsuario`, model `Perfil` | `perfis.test.js` (28), `api.test.js` (33) — criação restrita ao administrador | ✅ completo |
| **RF023** | Permissões específicas para cada tipo de usuário | `exigirPerfil` / `exigirPerfilApi`, rota a rota em `webRoutes.js` | `perfis.test.js`, `api.test.js`, `auditoria.test.js`, `retencao.test.js` | ✅ completo |

### 2.2.1 Casos de uso (monografia, seções 2.3.1 e 2.4)

Os casos de uso gerais (série "RF" da seção 2.3.1) aparecem como **UC RF00x**; os
específicos, como **UC001–UC009**.

| Caso de uso | Onde está | Teste que cobre | Observação |
|---|---|---|---|
| UC RF001 — Controlar clientes | `clienteService`, `/clientes` | ver RF001, RF002 | — |
| UC RF002 — Controlar equipamentos | `equipamentoService`, `/equipamentos` | ver RF003, RF004 | — |
| UC RF003 — Controlar ordens de serviço | `ordemServicoService`, `/ordens` | ver RF005 a RF007 | — |
| UC RF004 — Controlar orçamentos | `registrarOrcamento`, `aprovarOrcamento` | ver RF008 a RF010 | — |
| UC RF005 — Controlar execução de serviços | `servicoExecutadoService` | ver RF011, RF013 | — |
| UC RF006 — Controlar produtos e estoque | `produtoService`, `itemOrdemService`, `/produtos` | `unit/produtoService.test.js` (34), `unit/itemOrdemService.test.js` (37), `estoque.test.js` (16) | ✅ completo |
| UC RF007 — Controlar financeiro | `financeiroService`, `/financeiro` | `unit/financeiroService.test.js` (30), `financeiro.test.js` (15) | ✅ completo |
| UC RF008 — Emitir relatórios (período e filtros; exibido **ou exportado**) | `relatorioService`, `csvService`, `/relatorios` | `unit/relatorioService.test.js` (26), `unit/csvService.test.js` (12), `relatorios.test.js` (21), `dashboard.test.js` (CSV) | ✅ completo |
| UC001 — Abrir OS | `abrirOrdem`, `/ordens/nova` | ver RF005 | O número da OS é gerado pelo sistema, como diz o caso de uso |
| UC002 — Consultar OS | `/ordens`, `/ordens/:id` | `perfis.test.js`, `fusoTelas.test.js` | — |
| UC003 — Atualizar status | `atualizarStatus` | ver RF007 | — |
| UC004 — Encerrar OS | `faturarEEncerrar` | `unit/ordemServicoService.test.js` | **Diverge do texto:** a monografia diz "técnico ou administrador"; no sistema, encerrar é faturar e é **só do administrador** (decisão registrada, por causa da conta a receber gerada junto) |
| UC005 — Cliente consulta o status | `/consulta` (sem login) | `garantia.test.js`, `rastreio.test.js` | Hoje também mostra a entrega em mapa (Módulo 6) |
| UC006 — Cadastrar cliente | `clienteService.criarCliente` | ver RF001 | — |
| UC007 — Consultar cliente | `/clientes` | ver RF002 | — |
| UC008 — Editar cliente | `/clientes/:id` | ver RF002 | — |
| UC009 — Excluir cliente (só administrador) | `clienteService.excluirCliente`, `POST /clientes/:id/excluir` | `clientes.test.js`, `perfis.test.js` (administrador desativa; os cinco outros perfis são barrados mesmo por POST direto; sem sessão nada muda) | **Diverge do texto:** a exclusão é **lógica** (o cliente é desativado), porque o histórico fiscal não pode sumir. Era o que a V02 chamava, por engano, de "RF004" |

### 2.3 Módulo 6 — rastreamento de entregas (numeração proposta pela dupla)

Requisitos criados depois da monografia 0.0.8 (que termina em RF023): os
enunciados vêm do pedido do módulo e a numeração **continua a sequência** da
monografia. Entram no texto na versão seguinte. Detalhes em
`LEIAME-MODULO6.md`.

| ID | Enunciado | Onde está | Teste que cobre | Status |
|---|---|---|---|---|
| **RF024** | Registrar saída para entrega com uma ou mais OS finalizadas | `entregaService.iniciarSaida`, tela `/entregas/saida`; RN13–RN18 | `unit/entregaService.test.js` (36), `modeloEntregas.test.js` (20), `entregas.test.js` (49) | ✅ completo |
| **RF025** | Compartilhar a localização do entregador durante a saída | `public/js/entregador.js`, `entregaService.registrarPosicao`; RN19–RN21 | `unit/entregadorScript.test.js` (26), `unit/entregaService.test.js`, `entregas.test.js`; celular real em `TESTES.md` 3.9 | ✅ completo |
| **RF026** | Registrar a conclusão de cada entrega (entregue, não entregue, encerrar, cancelar) | `entregaService.marcarEntrega`, `encerrarSaida`, `cancelarSaida`; RN22–RN25 | `unit/entregaService.test.js`, `entregas.test.js` | ✅ completo |
| **RF027** | O cliente acompanha a entrega no mapa pela consulta pública | `rastreioService`, `public/js/rastreio.js`, consulta pública; RN26–RN32 | `unit/rastreioService.test.js` (24), `rastreio.test.js` (17) | ✅ completo |
| **RF028** | Painel de entregas do administrador | `/entregas`, `public/js/painel-entregas.js`; RN33–RN34 | `unit/painelEntregasScript.test.js` (8), `entregas.test.js`, `simulador.test.js` (6) | ✅ completo |

---

## 3. Requisitos não funcionais

| ID | Enunciado | Onde está | Teste que cobre | Status |
|---|---|---|---|---|
| **NF001** | Usabilidade: interface simples e intuitiva para os funcionários | Layout das telas, responsivo; `docs/APENDICE-A-USABILIDADE.md` | Não é testável por máquina. A avaliação foi aplicada com o consultor; `[VALIDAR: registrar os resultados no Apêndice A]` | 🔶 parcial |
| **NF002** | Segurança: autenticação de usuários para acesso seguro às informações | `authService`, `sessaoMiddleware`, `perfilMiddleware`, bcrypt, trava de tentativas de login | `perfis.test.js`, `seguranca.test.js`, `unit/authService.test.js`, `csrf.test.js` | ✅ completo |
| **NF003** | Portabilidade: acessível por navegadores web **em computadores desktop** | Aplicação web renderizada no servidor | Chromium (desktop e celular) medido, ver `TESTES.md` 1.6. **Firefox e Safari ainda não foram testados.** O texto fala só em desktop, mas o Módulo 6 roda no celular do entregador: Enunciado reescrito na monografia 0.0.9 para "desktop e celulares". | 🔶 parcial |
| **NF004** | Expansibilidade: permitir futuras expansões para integração com análise geográfica dos clientes (hoje implementada) | `relatorioService.porRegiao`, bloco 🗺️ em `/relatorios` e exportação CSV | `unit/relatorioService.test.js` (8 casos), `relatorios.test.js` (4 casos) | ✅ completo |
| **NF005** | Rastreabilidade (log de auditoria) | `auditoriaExtensao`, `contextoRequisicao`, tela `/auditoria`, tabela `logs_auditoria` | `unit/auditoriaExtensao.test.js` (15), `auditoria.test.js` (22) | ✅ completo |
| **NF006** | Backup | `scripts/backup.js`, `npm run backup`, `scripts/conferir-restauracao.sh`, `docs/BACKUP.md` | `unit/backup.test.js` (15) cobre URL, nome e argumentos; o **ciclo dump → restauração roda no CI a cada push**, comparando tabela a tabela | ✅ completo |
| **NF007** | Segurança na comunicação | `src/config/seguranca.js` — CSP, HSTS, HTTPS, cookie, CORS, limite de login e da consulta pública; `src/middlewares/csrfMiddleware.js` — token CSRF | `unit/seguranca.test.js` (27), `unit/csrf.test.js` (23), `seguranca.test.js` (23), `csrf.test.js` (16) | 🔶 parcial |
| **NF009** | Privacidade da localização: só durante a rota, segundo fator, token só como hash, resposta mínima, retenção e anonimização | `rastreioService`, `src/config/seguranca.js`, `retencaoService.limparTrajetosAntigos`; RN26–RN30, RN33–RN38; `SEGURANCA.md` 4.4, `RETENCAO.md` 3.5 | `rastreio.test.js` (17), `retencaoEntregas.test.js` (13), `unit/rastreioService.test.js`, `unit/retencaoService.test.js` | ✅ completo — prazo de 30 dias `[VALIDAR]` |
| **NF008** | Retenção e descarte (LGPD) | `retencaoService`, `clientes.anonimizadoEm`, `equipamentos.ativo`, `scripts/reparar-anonimizacoes.js`, `docs/RETENCAO.md` | `retencao.test.js` (34), `unit/retencaoService.test.js` (21) | 🔶 parcial |

### Por que NF006, NF007 e NF008 são parciais

| ID | O que falta | Onde está registrado |
|---|---|---|
| ~~NF006~~ | ~~O ciclo nunca foi executado~~ — **resolvido**: roda no CI, que tem `mysqldump` e MySQL | `docs/BACKUP.md`, seção 5 |
| NF007 | `'unsafe-inline'` em `style-src` (o de `script-src` **saiu** em 15/10/2026) e o comportamento sob HTTPS real nunca foi exercitado. O limite de tentativas de login e o token CSRF **foram implementados** — ver `docs/SEGURANCA.md`, seções 4.1 e 4.2 | `docs/SEGURANCA.md`, seção 7 |
| NF008 | O **descarte** está completo: a anonimização alcança o cadastro, a descrição das contas geradas no faturamento e o log de auditoria, e há reparo para anonimizações antigas. O que falta é a **retenção** dos dados de cliente: os prazos da seção 5 do `RETENCAO.md` são proposta, e nenhuma rotina os aplica automaticamente — a exceção, desde 18/10/2026, é o trajeto e o destino das entregas (RN35 e RN36). Também não há registro de consentimento | `docs/RETENCAO.md`, seções 3.3 e 7 |

---

## 4. Requisitos sem teste automatizado

> Esta seção existe porque o plano pede que a ausência de teste seja dita
> abertamente, em vez de preenchida.

| ID | O que não tem teste | Gravidade | Comentário |
|---|---|---|---|
| ~~UC009~~ | ~~A rota web e sua trava de administrador (chamado antes de "RF004")~~ | — | **Resolvido**: 7 casos novos em `perfis.test.js` cobrem o administrador desativando, os cinco perfis barrados por POST direto e o acesso sem sessão |
| ~~NF004~~ | ~~Não há teste porque não há implementação~~ | — | **Resolvido**: implementado e coberto por 12 casos |
| ~~NF006~~ | ~~O ciclo real de backup e restauração~~ | — | **Resolvido**: `scripts/conferir-restauracao.sh` roda no CI a cada push |
| **NF007** | Comportamento sob TLS de verdade | Média | A lógica está testada e o limite de tentativas de login **passou a ter cobertura** (3 casos). O que falta é o tráfego cifrado real |
| **RF006** | Que a abertura de OS **sem** defeito é recusada. O defeito é coluna obrigatória no banco, mas nenhum teste tenta abrir sem ele | Baixa | Um caso em `ordemServicoService.test.js` ou na tela fecha a lacuna |
| ~~RF001–RF011~~ | ~~Enunciado desconhecido~~ | — | **Resolvido em 04/11/2026**: a monografia foi localizada e os enunciados entraram na seção 2.1 |

### Lacunas de teste que não são de requisito

Registradas em `docs/TESTES.md`, seção 1.6: renderização no navegador, HTTPS
real, carga e concorrência, e compatibilidade entre navegadores.

---

## 5. Resumo

### Requisitos funcionais

| Status | Quantidade |
|---|---|
| ✅ Completo | 27 (RF001–RF005, RF007–RF023 e RF024–RF028) |
| ⚠️ Implementado sem teste direto | 1 (RF006) |
| ❌ Não implementado | 0 |
| **Total** | **28** |

**Nenhum requisito funcional ficou sem implementação.** O único sem teste que o
exercite diretamente é o RF006 (recusar OS sem defeito).

### Requisitos não funcionais

| Status | Quantidade |
|---|---|
| ✅ Completo | 5 (NF002, NF004, NF005, NF006, NF009) |
| 🔶 Parcial | 4 (NF001, NF003, NF007, NF008) |
| ❌ Não implementado | 0 |
| **Total** | **9** |

NF001–NF004 são da monografia; NF005–NF009 foram criados pela dupla depois dela.

### Cobertura por módulo

| Módulo | Requisitos | Testes dedicados |
|---|---|---|
| 1 — Base | RF001–RF004, RF022, RF023, NF002 | `clienteService`, `clientes`, `equipamentoService`, `perfis` |
| 2 — Ordens de serviço | RF005–RF007, UC005 | `ordemServicoService`, `garantia` (consulta pública) |
| 3 — Orçamento, serviços e garantia | RF008–RF013 | `servicoExecutadoService`, `garantia`, `historicoEquipamento` |
| 4 — Produtos, estoque, financeiro, perfis | UC RF006, UC RF007, RF014, RF015, RF020–RF023 | `produtoService`, `itemOrdemService`, `financeiroService`, `estoque`, `financeiro`, `perfis`, `api` |
| 5 — Relatórios | UC RF008, RF016–RF019, NF004 | `relatorioService`, `csvService`, `relatorios`, `tiposServico`, `dashboard` |
| NF005 — Auditoria | NF005 | `auditoriaExtensao`, `auditoria` |
| NF006–NF008 | NF006, NF007, NF008 | `backup`, `seguranca` (×2), `retencao` |
| 6 — Rastreamento de entregas | RF024–RF028, NF009 | `entregaService`, `geocodificacaoService`, `rastreioService`, `entregadorScript`, `painelEntregasScript`, `simuladorEntrega`, `modeloEntregas`, `entregas`, `rastreio`, `simulador`, `retencaoEntregas` |

---

## 6. Como esta matriz se mantém verdadeira

Os números desta matriz foram conferidos arquivo por arquivo contra a execução
real da suíte, não estimados. Para refazer a conferência:

```cmd
npx jest --json --outputFile=resultados.json
```

O CI roda as duas suítes contra MySQL 8 a cada push, então **divergência entre
esta matriz e a realidade aparece no GitHub Actions antes de aparecer na banca**.
