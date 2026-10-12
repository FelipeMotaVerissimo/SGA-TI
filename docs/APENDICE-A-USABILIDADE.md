# Apêndice A — Avaliação de Usabilidade do SGA TI

**Instrumento de coleta — pronto para aplicar**
Versão 1 · Outubro de 2026

---

## Instruções para quem aplica

Este apêndice tem **cinco partes**. A ordem importa:

| Parte | O quê | Quem preenche | Tempo |
|---|---|---|---|
| 1 | Identificação do participante | Participante | 2 min |
| 2 | **Roteiro de tarefas** — observação | **Aplicador** | 20–30 min |
| 3 | Escala SUS adaptada | Participante | 5 min |
| 4 | Perguntas por tela | Participante | 10 min |
| 5 | Questões abertas | Participante | 5 min |

> **A parte 2 vem antes da 3 de propósito.** O participante precisa ter usado o
> sistema para opinar sobre ele. Questionário respondido sem uso mede impressão,
> não usabilidade.

### Regras durante as tarefas

1. **Não ensine.** Se o participante travar, anote onde travou e aguarde 60
   segundos antes de ajudar. O travamento é o dado.
2. **Peça para pensar em voz alta.** "O que você está procurando agora?"
3. **Não defenda o sistema.** Quem aplica anota, não explica.
4. Registre o **tempo** e se a tarefa foi concluída **sem ajuda**, **com ajuda**
   ou **não concluída**.

### Participantes previstos

| # | Quem | Perfil no sistema | Papel na avaliação |
|---|---|---|---|
| P1 | Consultor — proprietário da Lelo Informática | `ADMINISTRADOR` | Avalia aderência ao processo real da assistência |
| P2 | Usuário de atendimento | `ATENDENTE` | Avalia o balcão: cadastro e abertura de OS |
| P3 | Usuário técnico | `TECNICO` | Avalia a bancada: serviços e garantia |

`[VALIDAR: confirmar com o orientador se três participantes bastam. A literatura
de usabilidade (Nielsen) sustenta que 5 usuários encontram cerca de 85% dos
problemas; com 3 a cobertura é menor, mas é o que a estrutura da empresa
oferece.]`

### Preparação do ambiente

- [ ] Sistema no ar, com a massa de demonstração carregada
- [ ] Os seis usuários criados, um por perfil (ver `docs/COMO-RODAR.md`, seção 5)
- [ ] Navegador em janela maximizada
- [ ] Cronômetro
- [ ] Termo de consentimento assinado

---

## Parte 1 — Identificação

**Participante nº:** ______  **Data:** ____/____/______  **Início:** ______

| Campo | Resposta |
|---|---|
| Função na empresa | |
| Perfil usado no teste | ☐ Administrador ☐ Atendente ☐ Técnico ☐ Outro: ______ |
| Tempo de experiência na função | ☐ menos de 1 ano ☐ 1 a 3 ☐ 3 a 10 ☐ mais de 10 |
| Com que frequência usa computador no trabalho | ☐ raramente ☐ às vezes ☐ diariamente |
| Já usou algum sistema de gestão de OS? | ☐ não ☐ sim — qual: __________ |
| Hoje, como a assistência controla as ordens de serviço? | ☐ papel ☐ planilha ☐ sistema ☐ outro: ______ |

---

## Parte 2 — Roteiro de tarefas (preenchido pelo aplicador)

Aplique **apenas o bloco do perfil do participante**. O bloco do administrador
inclui as tarefas transversais.

### Bloco A — Atendente (telas `/clientes`, `/equipamentos`, `/ordens`)

| # | Tarefa | Tela | Tempo | Resultado | Onde travou |
|---|---|---|---|---|---|
| A1 | Cadastre o cliente **Maria Souza**, CPF 111.222.333-44, de Dourados/MS | `/clientes/novo` | ____ | ☐ sozinho ☐ com ajuda ☐ não | |
| A2 | Cadastre um **notebook Acer Aspire 5** para a Maria, com o defeito "não liga" | `/equipamentos/novo` | ____ | ☐ sozinho ☐ com ajuda ☐ não | |
| A3 | Abra uma **ordem de serviço** para esse notebook | `/ordens/nova` | ____ | ☐ sozinho ☐ com ajuda ☐ não | |
| A4 | Descubra o **número da OS** que você acabou de abrir | `/ordens` | ____ | ☐ sozinho ☐ com ajuda ☐ não | |
| A5 | O cliente ligou: o orçamento foi aprovado. **Registre a aprovação** | `/ordens/:id` | ____ | ☐ sozinho ☐ com ajuda ☐ não | |
| A6 | Veja **tudo que já foi feito** nesse notebook em atendimentos anteriores | `/equipamentos/:id/historico` | ____ | ☐ sozinho ☐ com ajuda ☐ não | |

### Bloco B — Técnico (telas `/ordens`, `/equipamentos/:id/historico`)

| # | Tarefa | Tela | Tempo | Resultado | Onde travou |
|---|---|---|---|---|---|
| B1 | Encontre as OS que estão **em andamento** | `/ordens` | ____ | ☐ sozinho ☐ com ajuda ☐ não | |
| B2 | Numa OS autorizada, **registre o serviço** "troca da placa-mãe", com 90 dias de garantia | `/ordens/:id` | ____ | ☐ sozinho ☐ com ajuda ☐ não | |
| B3 | Diga **até quando** a garantia desse serviço vale | `/ordens/:id` | ____ | ☐ sozinho ☐ com ajuda ☐ não | |
| B4 | Antes de orçar um conserto, verifique se **esse equipamento já tem serviço em garantia** | `/equipamentos/:id/historico` | ____ | ☐ sozinho ☐ com ajuda ☐ não | |
| B5 | Mude o **status** de uma OS para finalizada | `/ordens/:id` | ____ | ☐ sozinho ☐ com ajuda ☐ não | |
| B6 | Veja quantos serviços seus estão **em garantia vigente** | `/dashboard` | ____ | ☐ sozinho ☐ com ajuda ☐ não | |

### Bloco C — Administrador / gestão (consultor)

| # | Tarefa | Tela | Tempo | Resultado | Onde travou |
|---|---|---|---|---|---|
| C1 | Descubra **quanto a empresa tem a receber** e quanto está vencido | `/dashboard` ou `/financeiro` | ____ | ☐ sozinho ☐ com ajuda ☐ não | |
| C2 | Descubra **quais produtos estão com saldo negativo** | `/dashboard` ou `/produtos` | ____ | ☐ sozinho ☐ com ajuda ☐ não | |
| C3 | Levante os **cinco maiores clientes** dos últimos 30 dias | `/relatorios` | ____ | ☐ sozinho ☐ com ajuda ☐ não | |
| C4 | Levante o mesmo relatório **só do mês de agosto** | `/relatorios` | ____ | ☐ sozinho ☐ com ajuda ☐ não | |
| C5 | **Exporte** esse relatório para abrir no Excel | `/relatorios` | ____ | ☐ sozinho ☐ com ajuda ☐ não | |
| C6 | Descubra **quem alterou** o cadastro de um cliente e o que mudou | `/auditoria` | ____ | ☐ sozinho ☐ com ajuda ☐ não | |
| C7 | **Feche uma OS** e verifique se a conta a receber foi gerada | `/ordens/:id` → `/financeiro` | ____ | ☐ sozinho ☐ com ajuda ☐ não | |

### Bloco D — Cliente (consulta pública, sem login)

Aplicar com **qualquer** participante, inclusive alguém de fora da empresa.

| # | Tarefa | Tela | Tempo | Resultado | Onde travou |
|---|---|---|---|---|---|
| D1 | Sem fazer login, descubra **em que pé está** a OS de número ______ | `/consulta` | ____ | ☐ sozinho ☐ com ajuda ☐ não | |
| D2 | Diga se o serviço feito **ainda está na garantia** | `/consulta` | ____ | ☐ sozinho ☐ com ajuda ☐ não | |

### Observações do aplicador

> Registre aqui o que o participante **falou**, não o que você concluiu.
> Frases literais valem mais que interpretações.

```
_______________________________________________________________________

_______________________________________________________________________

_______________________________________________________________________
```

---

## Parte 3 — Escala SUS adaptada

> **Instrução ao participante:** marque de 1 a 5 conforme sua concordância.
> Não existe resposta certa. Se ficar em dúvida, marque o que lhe veio primeiro.
>
> **1 = discordo totalmente · 5 = concordo totalmente**

| # | Afirmação | 1 | 2 | 3 | 4 | 5 |
|---|---|:-:|:-:|:-:|:-:|:-:|
| 1 | Eu usaria o SGA TI com frequência no meu dia a dia | ☐ | ☐ | ☐ | ☐ | ☐ |
| 2 | O sistema é mais complicado do que precisaria ser | ☐ | ☐ | ☐ | ☐ | ☐ |
| 3 | O sistema é fácil de usar | ☐ | ☐ | ☐ | ☐ | ☐ |
| 4 | Eu precisaria de ajuda de alguém de informática para conseguir usar | ☐ | ☐ | ☐ | ☐ | ☐ |
| 5 | As partes do sistema funcionam bem juntas — cadastro, ordem de serviço, estoque e financeiro conversam entre si | ☐ | ☐ | ☐ | ☐ | ☐ |
| 6 | O sistema se comporta de maneiras diferentes em situações parecidas | ☐ | ☐ | ☐ | ☐ | ☐ |
| 7 | Imagino que a maioria das pessoas aprenderia a usar rapidamente | ☐ | ☐ | ☐ | ☐ | ☐ |
| 8 | O sistema é desajeitado ou travado de usar | ☐ | ☐ | ☐ | ☐ | ☐ |
| 9 | Me senti seguro usando o sistema — sabia o que ia acontecer a cada ação | ☐ | ☐ | ☐ | ☐ | ☐ |
| 10 | Precisei aprender muita coisa antes de conseguir usar | ☐ | ☐ | ☐ | ☐ | ☐ |

### Como calcular o SUS (preenchido pelo aplicador)

1. Itens **ímpares** (1, 3, 5, 7, 9): subtraia 1 da resposta → `resposta − 1`
2. Itens **pares** (2, 4, 6, 8, 10): subtraia a resposta de 5 → `5 − resposta`
3. Some os dez valores e **multiplique por 2,5**

O resultado vai de 0 a 100. **Não é porcentagem.**

| Faixa | Leitura |
|---|---|
| abaixo de 51 | Inaceitável |
| 51 a 67 | Ruim |
| 68 | Média de referência |
| 68 a 80 | Bom |
| acima de 80 | Excelente |

**Pontuação deste participante:** ______

---

## Parte 4 — Perguntas por tela

> Responda **apenas sobre as telas que você usou** nas tarefas.
> **1 = discordo totalmente · 5 = concordo totalmente · NA = não usei**

### Entrada e visão geral

| # | Afirmação | 1 | 2 | 3 | 4 | 5 | NA |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| T1 | A tela de **login** é direta: soube o que preencher sem pensar | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| T2 | O **menu lateral** mostra só o que eu preciso, sem opções que não uso | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| T3 | O **dashboard** responde "como está a oficina hoje?" logo na abertura | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| T4 | Os números do dashboard **são os que me interessam** | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

### Cadastros

| # | Afirmação | 1 | 2 | 3 | 4 | 5 | NA |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| T5 | O formulário de **cliente** pede os dados na ordem em que eu os recebo no balcão | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| T6 | Quando erro um campo, a mensagem **diz o que fazer**, não só que está errado | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| T7 | Cadastrar um **equipamento** e vinculá-lo ao cliente foi natural | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| T8 | A escolha do **tipo de equipamento** (notebook, impressora...) cobre o que entra aqui | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

### Ordem de serviço

| # | Afirmação | 1 | 2 | 3 | 4 | 5 | NA |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| T9 | A **lista de OS** deixa claro o que está esperando ação minha | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| T10 | Os **status** (inicial, orçamento, autorizado, em andamento, finalizado) correspondem ao que acontece de verdade na oficina | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| T11 | Na tela de **detalhe da OS** encontro tudo sobre aquele atendimento sem precisar sair dela | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| T12 | Registrar o **orçamento** e a resposta do cliente é rápido | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| T13 | O sistema **impede** o que não pode ser feito (lançar serviço antes da aprovação, por exemplo) de um jeito que faz sentido | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

### Serviços e garantia

| # | Afirmação | 1 | 2 | 3 | 4 | 5 | NA |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| T14 | Registrar um **serviço executado** leva o tempo que deveria levar | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| T15 | A **situação da garantia** (em garantia, vencida, sem garantia) é visível sem eu ter que calcular nada | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| T16 | O **histórico do equipamento** me pouparia tempo num atendimento de retorno | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| T17 | Classificar o serviço por **tipo** faz sentido para mim | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

### Produtos e estoque

| # | Afirmação | 1 | 2 | 3 | 4 | 5 | NA |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| T18 | Lançar uma **peça na OS** é simples | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| T19 | Entendi por que o sistema **permite** o saldo ficar negativo e me avisa em vez de bloquear | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| T20 | A lista **"a regularizar"** me diz o que comprar | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

### Financeiro

| # | Afirmação | 1 | 2 | 3 | 4 | 5 | NA |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| T21 | O painel financeiro mostra a situação do caixa de forma confiável | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| T22 | A **conta a receber gerada automaticamente** ao fechar a OS é o comportamento que eu esperava | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| T23 | Dar **baixa** numa conta é claro o bastante para não gerar erro | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

### Relatórios e auditoria

| # | Afirmação | 1 | 2 | 3 | 4 | 5 | NA |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| T24 | Escolher o **período** do relatório é intuitivo | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| T25 | Os quatro relatórios respondem perguntas que eu realmente faço | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| T26 | O arquivo **CSV** abriu certo no Excel, com acento e valores corretos | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| T27 | A tela de **auditoria** me daria segurança para delegar tarefas a outras pessoas | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

### Consulta pública (cliente)

| # | Afirmação | 1 | 2 | 3 | 4 | 5 | NA |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| T28 | Um cliente conseguiria consultar a OS sozinho, sem ligar para a loja | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| T29 | A consulta mostra o que o cliente quer saber, sem expor o que não deveria | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

## Parte 5 — Questões abertas

**1. Qual foi a parte mais difícil de usar? Por quê?**
```
_______________________________________________________________________
_______________________________________________________________________
```

**2. O que no sistema não corresponde ao jeito que a assistência trabalha hoje?**
```
_______________________________________________________________________
_______________________________________________________________________
```

**3. O que faltou? Cite algo que você precisaria e não encontrou.**
```
_______________________________________________________________________
_______________________________________________________________________
```

**4. O que o sistema resolveria do problema que você tem hoje?**
```
_______________________________________________________________________
_______________________________________________________________________
```

**5. Se pudesse mudar uma única coisa, qual seria?**
```
_______________________________________________________________________
_______________________________________________________________________
```

**6. Você usaria este sistema na sua rotina? Por quê?**
```
☐ Sim    ☐ Sim, com ressalvas    ☐ Não

_______________________________________________________________________
```

---

**Encerramento:** ______    **Duração total:** ______ min

Assinatura do participante: _______________________________

---

## Consolidação dos resultados (uso da dupla)

Preencher após aplicar com todos os participantes. **Não preencher antes** — os
espaços em branco são a honestidade do instrumento.

### Pontuação SUS

| Participante | Perfil | SUS | Leitura |
|---|---|---|---|
| P1 | Administrador | | |
| P2 | Atendente | | |
| P3 | Técnico | | |
| **Média** | | | |

### Taxa de conclusão das tarefas

| Bloco | Tarefas | Sem ajuda | Com ajuda | Não concluídas |
|---|---|---|---|---|
| A — Atendente | 6 | | | |
| B — Técnico | 6 | | | |
| C — Administrador | 7 | | | |
| D — Cliente | 2 | | | |

### Problemas encontrados

| # | Problema | Tela | Gravidade | Quantos participantes | Ação |
|---|---|---|---|---|---|
| 1 | | | ☐ baixa ☐ média ☐ alta | | |
| 2 | | | ☐ baixa ☐ média ☐ alta | | |
| 3 | | | ☐ baixa ☐ média ☐ alta | | |

> **Critério de gravidade:** alta = impede concluir a tarefa; média = conclui mas
> com esforço ou erro; baixa = incômodo que não impede nada.
