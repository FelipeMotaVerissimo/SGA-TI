# Apêndice C — Testes de Software do SGA TI

**Versão 1 · Novembro de 2026** — anexo de testes de software da 6ª Etapa do TCC.
Os números foram conferidos pela execução real da suíte, não estimados. O
detalhamento completo, arquivo por arquivo, está em `docs/TESTES.md`.

---

## 1. ESTRATÉGIA DE TESTES

O SGA TI foi testado em quatro níveis, do mais rápido ao mais próximo do uso
real:

| Nível | O que verifica | Ferramenta | Quando roda |
|---|---|---|---|
| **Unitário** | As regras de negócio de cada serviço (orçamento, garantia, estoque, financeiro, entregas), com o banco de dados substituído por um dublê | Jest | A cada alteração |
| **Integração** | O sistema de verdade: rotas, sessão, permissões por perfil, telas e banco de dados real, recriado a cada execução | Jest e Supertest | A cada alteração |
| **Integração contínua** | As duas suítes contra um MySQL 8 real, a conferência das migrations com o esquema e o ciclo de backup e restauração | GitHub Actions | A cada envio ao repositório |
| **Manual** | O que a máquina não vê: a tela no navegador, no celular e num aparelho real com GPS | Navegador e celular | A cada tela nova ou alterada |

Duas regras valeram durante todo o desenvolvimento:

- **todo teste novo precisa falhar sem a correção.** A regra é desligada de
  propósito, o teste é executado para provar que acusa a falha, e a regra é
  restaurada. Um teste que passa com a regra desligada não testa nada;
- **o que aparece na tela é conferido no navegador**, porque os testes
  automatizados leem o HTML, mas não executam o CSS nem o JavaScript. Boa parte
  dos defeitos visuais foi achada assim (seção 6).

A suíte roda com o relógio em **UTC**, o mesmo de um servidor na nuvem, para que
datas e horários formatados sem o fuso de Dourados apareçam como erro no teste,
e não só em produção.

## 2. RESULTADO CONSOLIDADO

Execução de 09/11/2026, sobre o código da versão entregue:

| Suíte | Casos | Passando | Falhando |
|---|---|---|---|
| Unitários | 443 | 443 | 0 |
| Integração | 422 | 422 | 0 |
| **Total** | **865** | **865** | **0** |

A integração contínua (GitHub Actions) executa a cada envio as mesmas 865 provas
contra um **MySQL 8** real, confere que as migrations reproduzem exatamente o
esquema do banco e executa o ciclo completo de **backup e restauração**,
comparando as 17 tabelas do banco restaurado com o original: 0 divergências.

## 3. COBERTURA POR REQUISITO

| Requisitos | O que é testado | Principais arquivos de teste |
|---|---|---|
| RF001–RF004 | Cadastro, consulta e edição de clientes e equipamentos; CPF/CNPJ único; vínculo do equipamento ao cliente | `clienteService`, `clientes`, `equipamentoService`, `tiposServico` |
| RF005–RF010 | Abertura da OS, seis status, travas de transição, orçamento, aprovação e previsão de entrega | `ordemServicoService`, `garantia` |
| RF011–RF013 | Serviços executados, técnico do serviço, histórico por equipamento e garantia calculada | `servicoExecutadoService`, `garantia`, `historicoEquipamento`, `servicoTecnicoPeca` |
| RF014–RF015 | Produtos, entradas e saídas de estoque, saldo conferido com as movimentações | `produtoService`, `itemOrdemService`, `estoque` |
| RF016–RF019 | Os relatórios gerenciais e a exportação em CSV | `relatorioService`, `csvService`, `relatorios`, `tiposServico`, `dashboard` |
| RF020–RF021 | Contas a pagar e a receber, e a conta gerada ao encerrar a OS | `financeiroService`, `financeiro`, `ordemServicoService` |
| RF022–RF023 | Usuários e permissões dos sete perfis, inclusive tentativas por acesso direto | `perfis`, `api`, `auth` |
| RF024–RF028 | Saída para entrega, localização, resultado de cada entrega, mapa do cliente e painel | `entregaService`, `entregas`, `modeloEntregas`, `rastreio`, `rastreioService`, `entregadorScript`, `simulador` |
| NF002, NF007 | Autenticação, limite de tentativas, token CSRF, cabeçalhos de segurança | `auth`, `seguranca`, `csrf` |
| NF004 | Relatório de demanda por região | `relatorioService`, `relatorios` |
| NF005 | Registro automático de auditoria, sem senhas | `auditoriaExtensao`, `auditoria` |
| NF006 | Backup e restauração | `backup` e o ciclo completo na integração contínua |
| NF008, NF009 | Anonimização (LGPD), retenção do trajeto e privacidade da localização | `retencaoService`, `retencao`, `retencaoEntregas`, `rastreio` |

## 4. CASOS DE TESTE REPRESENTATIVOS

Uma amostra dos 865 casos, escolhida para mostrar as regras mais importantes.
Todos estão na suíte automatizada e passam.

| ID | Requisito | Cenário | Resultado esperado | Obtido |
|---|---|---|---|---|
| CT01 | RF001 | Cadastrar um cliente com CPF/CNPJ já existente | Cadastro recusado | Passou |
| CT02 | RF005 | Abrir uma ordem de serviço | A OS nasce com o status Inicial | Passou |
| CT03 | RF008 | Informar o valor do orçamento com vírgula ou com ponto decimal | Valor aceito nos dois formatos | Passou |
| CT04 | RF009 | Aprovar um orçamento de OS que não está em Orçamento | Aprovação recusada | Passou |
| CT05 | RF011 | Registrar serviço em OS ainda não autorizada pelo cliente | Registro recusado | Passou |
| CT06 | RF011 | Registrar o primeiro serviço numa OS Autorizado | A OS passa sozinha para Em andamento | Passou |
| CT07 | RF013 | Consultar a garantia no último dia coberto e no dia seguinte | Vigente no último dia; vencida no dia seguinte | Passou |
| CT08 | RF021 | Faturar e encerrar a OS | Status Concluído e conta a receber gerados na mesma transação | Passou |
| CT09 | RF021 | Encerrar de novo uma OS já encerrada | Nenhuma segunda conta é gerada | Passou |
| CT10 | UC004 | Técnico tenta encerrar a OS | Recusado: encerrar depende da gerência | Passou |
| CT11 | RF015 | Vendedor tenta movimentar o estoque por requisição direta | Recusado | Passou |
| CT12 | UC009 | Os cinco perfis sem permissão tentam excluir um cliente | Todos barrados; nada muda no banco | Passou |
| CT13 | NF002 | Login com senha errada e com usuário inexistente | A mesma resposta nos dois casos, sem revelar quais logins existem | Passou |
| CT14 | NF007 | Errar o login até o limite de tentativas | A tentativa seguinte é barrada | Passou |
| CT15 | NF007 | Enviar um formulário sem o token CSRF | Resposta 403; nada muda no banco | Passou |
| CT16 | NF005 | Gravar um usuário com senha | A senha nunca chega ao registro de auditoria | Passou |
| CT17 | NF008 | Anonimizar um cliente | Dados pessoais apagados; OS e contas preservadas; cidade e estado mantidos | Passou |
| CT18 | RF024 | Iniciar uma segunda saída com outra ainda em rota | O banco recusa | Passou |
| CT19 | RF027 | Cliente informa os 4 dígitos errados do telefone | Sem mapa, com aviso | Passou |
| CT20 | RF025 | Três envios de posição chegando no mesmo instante | Só uma posição é gravada | Passou |
| CT21 | — | Registro feito às 22h30 em Dourados, com o servidor em UTC | A tela mostra o dia de Dourados, não o seguinte | Passou |
| CT22 | — | Desbloquear OS concluída com a senha certa e com a errada | Certa libera a edição; errada recebe "Senha incorreta." | Passou |

## 5. TESTES EM NAVEGADORES E CELULAR

| Verificação | Resultado |
|---|---|
| Chromium (motor do Chrome e do Edge), 20 telas em 1280 px | 20 de 20 corretas, nenhum erro de JavaScript, nenhum transbordo |
| Celular emulado com 375 px de largura | 10 telas medidas, todas a 100 % de escala, sem rolagem lateral; antes da correção do layout eram desenhadas a 43–53 % |
| Celular real, tela do entregador com GPS | Saída iniciada, localização enviada a cada 10 s com precisão de 6 a 13 m, tela mantida acesa; achou o defeito de envios em rajada (seção 6) |
| Firefox, Safari e outros aparelhos | Não testados |

## 6. DEFEITOS ENCONTRADOS E CORRIGIDOS

| # | Defeito | Como foi achado | Correção |
|---|---|---|---|
| 1 | Qualquer pessoa conseguia criar um usuário administrador pela API, sem login | Conferindo uma afirmação do documento | Criação de usuário restrita ao administrador, com teste |
| 2 | O limite de tentativas de login só funcionava pela API, não pela tela | Teste de integração | O limitador passou a reconhecer o login recusado pela tela |
| 3 | Teste passava no SQLite e falhava no MySQL (tamanho de coluna) | Integração contínua com MySQL | Dado de teste ajustado ao tamanho real |
| 4 | O nome do cliente anonimizado continuava na descrição da conta a receber | Olhando uma captura de tela do manual | Anonimização passou a alcançar as contas e o log |
| 5 | Ao desbloquear o celular, o navegador enviava várias posições ao mesmo tempo | Teste com celular real | Fila no servidor e um envio por vez no celular |
| 6 | Formulário da consulta pública saía do cartão em tela de 375 px | Capturas do manual | Ajuste da grade |
| 7 | Horários da tela do entregador e de onze telas antigas saíam no fuso do servidor | Teste com o relógio em UTC | Datas formatadas sempre no fuso de Dourados |
| 8 | O botão "Desbloquear com Senha" não abria a janela | Conferência no navegador para o manual | Script voltou a usar os elementos da tela |

## 7. LIMITAÇÕES

O que os testes **não** cobrem, dito abertamente:

- a aparência das telas não é verificada automaticamente: é conferida à mão, no
  navegador;
- o funcionamento sob HTTPS real não foi exercitado, porque o sistema ainda não
  foi implantado em produção;
- não houve teste de carga nem de vários usuários ao mesmo tempo;
- Firefox, Safari e outros modelos de celular não foram testados.
