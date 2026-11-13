# Apêndice C — Testes de Software do SGA TI

**Versão 2 · 13 de novembro de 2026** — anexo de testes de software da 6ª Etapa do TCC.
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
  dos defeitos visuais foi achada assim (seção 7).

A suíte roda com o relógio em **UTC**, o mesmo de um servidor na nuvem, para que
datas e horários formatados sem o fuso de Dourados apareçam como erro no teste,
e não só em produção.

## 2. RESULTADO CONSOLIDADO

Execução de 13/11/2026, sobre o código da versão entregue (integração contínua,
MySQL 8):

| Suíte | Casos | Passando | Falhando |
|---|---|---|---|
| Unitários | 450 | 450 | 0 |
| Integração | 458 | 458 | 0 |
| **Total** | **908** | **908** | **0** |

Na versão 1 (09/11/2026) eram 865 casos. Os 43 novos vieram da bateria de
testes da 6ª Etapa (seção 5) e das regras novas do financeiro e do cadastro.
Um dos casos de integração — 10 saídas de estoque simultâneas — só roda no
MySQL: o SQLite usado na máquina de desenvolvimento aceita uma gravação por vez.

**Cobertura** medida com `jest --coverage` sobre toda a suíte: **85,9 %** das
linhas, 79,7 % dos desvios (if/else) e 87,6 % das funções do código-fonte. As
regras de negócio são as mais cobertas; as camadas que só repassam a tela para
a regra, as menos.

A integração contínua (GitHub Actions) executa a cada envio as mesmas 908 provas
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

Uma amostra dos 908 casos, escolhida para mostrar as regras mais importantes.
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
| CT23 | NF007 | Script e SQL gravados em todos os cadastros e abertos em 14 telas e na consulta pública | Texto aparece escapado; nenhum script executa; nenhuma tabela afetada | Passou |
| CT24 | RF021 | Faturar a mesma OS duas vezes ao mesmo tempo (clique duplo) | Uma conta a receber só | Passou |
| CT25 | RF015 | 10 saídas de estoque do mesmo produto ao mesmo tempo | As 10 passam e o saldo cai exatamente 10 | Passou após correção (defeitos 13 e 14) |
| CT26 | RF005 | 3 OS abertas no mesmo milissegundo | 3 OS com números diferentes | Passou após correção (defeito 12) |
| CT27 | RF020 | R$ 0,20 parcelado em 24x | Recusado: não dá R$ 0,01 por parcela | Passou após correção (defeito 10) |
| CT28 | UC009 | Entregador tenta abrir uma tela de outro perfil | Barrado, com a mensagem "Acesso negado" | Passou após correção (defeito 9) |

## 5. BATERIA DE TESTES DA 6ª ETAPA

Em 13/11/2026 o sistema passou por uma bateria de testes feita para **procurar
defeitos**, e não só confirmar o que já funcionava. Cada tipo, em poucas palavras:

| Tipo de teste | O que é, de forma simples | Resultado |
|---|---|---|
| Permissões rota × perfil | Cada um dos 7 perfis tenta abrir cada uma das telas do sistema, e confere-se quem entra e quem é barrado | Telas corretas; achou o defeito 9 |
| Injeção de script (XSS) | Gravar um código JavaScript no lugar de um nome e ver se ele "roda" quando a tela abre | Nenhuma tela executou o código |
| Injeção de SQL | Digitar comandos de banco de dados nos campos e nas buscas | Tratados como texto comum; nada apagado |
| Valores-limite | Digitar valores no extremo do permitido (zero, negativo, texto no lugar de número, muitas parcelas) | Achou os defeitos 10 e 11 |
| Concorrência | Duas ou mais pessoas fazendo a mesma coisa no mesmo instante | Achou os defeitos 12, 13 e 14 |
| Cobertura | Medir quanto do código os testes realmente executam | 85,9 % das linhas |
| Dependências | Conferir se as bibliotecas usadas têm falhas conhecidas publicadas | Verificado; atualização tratada à parte |

Todo defeito achado foi corrigido com um teste que **falha com o código antigo e
passa com o novo**, e a correção só entrou depois da integração contínua verde.

## 6. TESTES EM NAVEGADORES E CELULAR

| Verificação | Resultado |
|---|---|
| Chromium (motor do Chrome e do Edge), 20 telas em 1280 px | 20 de 20 corretas, nenhum erro de JavaScript, nenhum transbordo |
| Celular emulado com 375 px de largura | 10 telas medidas, todas a 100 % de escala, sem rolagem lateral; antes da correção do layout eram desenhadas a 43–53 % |
| Celular real, tela do entregador com GPS | Saída iniciada, localização enviada a cada 10 s com precisão de 6 a 13 m, tela mantida acesa; achou o defeito de envios em rajada (seção 7) |
| Firefox, Safari e outros aparelhos | Não testados |

## 7. DEFEITOS ENCONTRADOS E CORRIGIDOS

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
| 9 | Entregador barrado numa tela de outro perfil voltava à sua tela sem a mensagem "Acesso negado"; e uma falha na tela de entregas virava redirecionamento sem fim | Permissões rota × perfil | A mensagem é preservada; a falha mostra a tela com aviso amigável |
| 10 | Valor pequeno parcelado gerava parcela negativa ou zerada (R$ 0,20 em 24x → −R$ 0,03) | Valores-limite | Divisão em centavos; valor que não comporta as parcelas é recusado |
| 11 | Número de parcelas inválido não gravava nada, mas a tela dizia "sucesso" | Valores-limite | Valor inválido vale 1x |
| 12 | O número da OS se repetia no mesmo milissegundo e a cada 16 min 40 s, e a OS não abria | Concorrência | Nova tentativa com outro número; mensagem amigável |
| 13 | Gravações simultâneas travavam: a auditoria pedia uma 2ª conexão ao banco de dentro da transação | Concorrência (MySQL) | A auditoria lê pela própria transação |
| 14 | Saídas de estoque simultâneas entravam em impasse (deadlock) no MySQL | Concorrência (MySQL) | O saldo é atualizado antes de gravar o movimento |

## 8. LIMITAÇÕES

O que os testes **não** cobrem, dito abertamente:

- a aparência das telas não é verificada automaticamente: é conferida à mão, no
  navegador;
- o funcionamento sob HTTPS real não foi exercitado, porque o sistema ainda não
  foi implantado em produção;
- não houve teste de carga (muitos usuários durante um tempo longo); a
  concorrência foi testada só em operações pontuais (seção 5);
- Firefox, Safari e outros modelos de celular não foram testados.
