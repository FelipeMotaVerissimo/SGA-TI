# NF008 — Retenção e descarte de dados pessoais

**Versão:** V01
**Data:** 06/10/2026
**Requisito:** NF008 — política de retenção e descarte
**Base legal:** Lei 13.709/2018 (LGPD), em especial os artigos 12, 16 e 18

---

## 1. O conflito que esta política resolve

O art. 18 da LGPD dá ao titular o direito de pedir a **eliminação** dos seus
dados pessoais (inciso VI) ou a **anonimização** dos dados desnecessários
(inciso IV).

A assistência técnica, porém, não pode simplesmente apagar um cliente:

- as **ordens de serviço** são registro operacional e fiscal, e precisam
  sobreviver ao pedido;
- o banco **nem permitiria** — as chaves estrangeiras são `ON DELETE RESTRICT`,
  justamente para proteger esse histórico (ver `docs/DER.md`, seção 6).

A saída está na própria lei. O **art. 16** admite a conservação para
cumprimento de obrigação legal e para uso exclusivo do controlador, desde que
anonimizados. E o **art. 12** é explícito: dado anonimizado **não é dado
pessoal**.

Por isso a política do SGA TI é: **anonimizar, não excluir**. O registro
continua existindo e sustentando o histórico, mas deixa de ser atribuível a uma
pessoa identificável.

---

## 2. Classificação dos dados

| Categoria | Onde | Tratamento |
|---|---|---|
| **Dado pessoal identificável** | `clientes`: nome, CPF/CNPJ, RG, data de nascimento, endereço, número, bairro, CEP, telefone, celular, e-mail | Apagado na anonimização |
| **Dado pessoal não identificável isoladamente** | `clientes`: cidade, estado | **Mantido** — ver 3.1 |
| **Dado operacional** | `ordens_servico`, `servicos_executados`, `itens_ordem`, `equipamentos` | Mantido integralmente |
| **Dado fiscal** | `contas_receber`, `contas_pagar` | Mantido integralmente |
| **Credencial** | `usuarios.senha` | Hash bcrypt; nunca aparece em log nem em tela (ver `docs/AUDITORIA.md`) |

---

## 3. A rotina de anonimização

**Onde:** `src/services/retencaoService.js`
**Tela:** botão **🔒 Anonimizar** na lista de clientes
**Acesso:** somente `ADMINISTRADOR`
**Rota:** `POST /clientes/:id/anonimizar`

### O que acontece

| Campo | Depois |
|---|---|
| `nome` | `Cliente anonimizado` |
| `cpfCnpj` | `ANON-<id>` |
| `rg`, `dataNascimento`, `endereco`, `numero`, `bairro`, `cep`, `telefone`, `celular`, `email` | `NULL` |
| `cidade`, `estado` | **inalterados** |
| `ativo` | `false` |
| `anonimizadoEm` | data e hora da operação |

Equipamentos, ordens de serviço, serviços executados, itens e contas **não são
tocados**.

### Por que o CPF vira `ANON-<id>` em vez de ficar vazio

`cpfCnpj` é `NOT NULL` e `UNIQUE`. Esvaziar não é possível, e usar um valor fixo
faria o segundo cliente anonimizado colidir com o primeiro. O id garante
unicidade, cabe no `VARCHAR(18)` e o prefixo deixa o registro reconhecível numa
consulta direta ao banco.

### 3.1 Por que cidade e estado permanecem

Decisão consciente, não esquecimento. Um município, isolado, não identifica
ninguém — e é o campo que sustenta a análise geográfica prevista no NF004.
Apagá-lo destruiria valor estatístico sem ganho real de privacidade.

O endereço **dentro** do município é identificável, e esse sai.

`[VALIDAR: se o orientador entender que a combinação cidade + histórico de OS
permite reidentificação num município pequeno, basta acrescentar `cidade` e
`estado` à lista `CAMPOS_ANONIMIZADOS` — é uma linha.]`

### 3.2 Regras

| # | Regra | Por quê |
|---|---|---|
| RN01 | O histórico (OS, equipamentos, serviços, contas) não é tocado | É o que justifica manter o registro em vez de apagá-lo |
| RN02 | A operação é **irreversível** | Não existe "desanonimizar": o dado foi sobrescrito, não escondido. Esconder seria bloqueio, não eliminação, e não atenderia ao inciso VI |
| RN03 | Anonimizar duas vezes é recusado | Para a data do primeiro atendimento ao titular não ser sobrescrita |
| RN04 | O cliente é desativado | Anonimizado não entra em OS nova |
| RN05 | A operação é auditada (NF005) | Fica registrado quem atendeu ao pedido e quando |

---

## 4. Exclusão lógica

Nenhum cadastro do sistema é apagado fisicamente. O que existe é a coluna
`ativo`:

| Tabela | Tem `ativo` | Observação |
|---|---|---|
| `clientes` | sim | Desde o Módulo 1 |
| `usuarios` | sim | Desde o Módulo 1 |
| `produtos` | sim | Desde o Módulo 4 |
| `tipos_servico` | sim | Desde o Módulo 5 |
| `equipamentos` | **sim, novo neste requisito** | Era a única tabela de cadastro sem exclusão lógica — um equipamento cadastrado por engano não tinha como sair da lista |

As demais tabelas (`ordens_servico`, `servicos_executados`, `itens_ordem`,
`movimentos_estoque`, `contas_pagar`, `contas_receber`, `logs_auditoria`,
`perfis`) **não têm nem devem ter**: são registros históricos, e o `RESTRICT`
das chaves estrangeiras já impede a exclusão física. Em `logs_auditoria` isso é
obrigatório — log que se apaga não prova nada.

### Equipamento inativo

- some da listagem padrão, volta com **👁 Mostrar inativos**;
- não é oferecido para abrir OS nova;
- mantém todo o histórico de ordens de serviço;
- pode ser reativado pelo administrador.

---

## 5. Prazos de retenção

`[VALIDAR: os prazos abaixo são proposta, não decisão da dupla. Precisam de
confirmação com o consultor e com o orientador antes de virarem política.]`

| Dado | Prazo sugerido | Fundamento |
|---|---|---|
| Ordem de serviço e itens | 5 anos após o encerramento | Prazo geral de prescrição de cobrança (art. 206, §5º, I do Código Civil) |
| Contas a pagar e receber | 5 anos | Mesmo fundamento, mais exigência fiscal |
| Dados pessoais de cliente sem OS há 5 anos | Anonimizar | Art. 16 da LGPD: não se conserva o que não é mais necessário |
| Log de auditoria | 1 ano | Equilíbrio entre rastreabilidade e volume |
| Backups | Ver `docs/BACKUP.md`, seção 4 | — |

---

## 6. Testes

`tests/integration/retencao.test.js` — 21 casos. O que fica provado:

- os dados pessoais somem **do banco**, não só da tela — o teste procura o
  e-mail e o CPF originais no registro inteiro e não os encontra;
- o histórico sobrevive: a contagem de ordens, equipamentos e contas é a mesma
  antes e depois, e a OS continua consultável, agora apontando para
  "Cliente anonimizado";
- cidade e estado permanecem;
- anonimizar duas vezes não sobrescreve a data da primeira;
- dois clientes anonimizados não colidem no `cpfCnpj` único;
- os cinco perfis não administrativos recebem 302 e **nada é alterado**;
- a operação aparece no log de auditoria, com o usuário que a executou;
- equipamento desativado some da lista, volta com o filtro, não entra em OS
  nova, preserva o histórico e pode ser reativado.

---

## 7. Pendências

| # | Item | Prioridade |
|---|---|---|
| P01 | **Não há expurgo automático.** A anonimização é sempre manual, a pedido. A política da seção 5 não é aplicada por rotina nenhuma | média |
| P02 | Não existe tela de consentimento nem registro da base legal de cada tratamento (art. 7º e 8º) | média |
| P03 | **O log de auditoria guarda o estado anterior das alterações**, então os dados pessoais apagados sobrevivem dentro de `logs_auditoria.valorAnterior`. Para a eliminação ser completa, o log da própria operação de anonimização precisa ser tratado — hoje não é | **alta** |
| P04 | Os backups anteriores à anonimização continuam com os dados pessoais. É limitação inerente a backup, mas precisa estar escrita na política | média |
| P05 | Não há exportação dos dados do titular (direito de portabilidade, art. 18, V) | baixa |

> **Sobre a P03:** é a pendência mais relevante deste requisito e não deve ser
> escondida numa defesa. A anonimização atende ao pedido do titular na base
> operacional, mas o sistema ainda guarda os dados no log. Resolver exige
> decidir o que vale mais — a rastreabilidade de quem anonimizou o quê, ou a
> eliminação completa — e implementar a limpeza seletiva do log daquele titular.
