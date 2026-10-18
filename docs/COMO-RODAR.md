# Como rodar o SGA TI

O sistema roda em **Node.js + Express 5 + Prisma + MySQL + EJS**. Este documento
cobre o que está no repositório, com os cinco módulos consolidados na `main`.
Basta ter o Node LTS e um MySQL Server.

---

## 1. Instalação

```cmd
npm install
```

---

## 2. Variáveis de ambiente

Crie um arquivo `.env` na raiz. Ele **não vai para o repositório** — cada pessoa
cria o seu.

```
DATABASE_URL="mysql://usuario:senha@localhost:3306/sga_ti"
PORT=3000
NODE_ENV=development
JWT_SECRET=troque_esta_chave
SESSION_SECRET=troque_esta_chave
CORS_ORIGINS=
```

> Em produção, `NODE_ENV=production` liga HSTS, redirecionamento HTTP→HTTPS,
> cookie `secure` e `trust proxy`. Em desenvolvimento tudo isso fica desligado
> de propósito, para o sistema continuar funcionando em `http://localhost`.
> Detalhes em `docs/SEGURANCA.md`.

| Variável | Quem lê | Obrigatória | Para que serve |
|---|---|---|---|
| `DATABASE_URL` | `prisma/schema.prisma` | sim | Conexão com o MySQL da aplicação |
| `PORT` | `server.js` | não (padrão 3000) | Porta HTTP |
| `NODE_ENV` | `src/app.js`, `src/config/seguranca.js`, `src/middlewares/errorHandler.js` | não | Em `production`, liga as proteções de transporte do NF007 e o tratador de erros deixa de expor o stack trace |
| `JWT_SECRET` | `src/controllers/authController.js` | sim | Assinatura do token das rotas de API (`/api/*`) |
| `SESSION_SECRET` | `src/app.js` | sim | Assinatura do cookie de sessão das telas web |
| `TEST_DATABASE_URL` | `tests/helpers/ambiente.js` | só nos testes | Banco **vazio e separado** para a suíte de integração (ver seção 6) |
| `URL_PUBLICA` | `src/controllers/entregaWebController.js` | não | Endereço público do sistema usado no link do aviso pelo WhatsApp (Módulo 6). Sem ela, vale a origem da própria requisição |
| `NOMINATIM_CONTATO` | `src/services/geocodificacaoService.js` | não | E-mail de contato enviado ao Nominatim no `User-Agent`, como a política do serviço recomenda (Módulo 6). Fica fora do repositório de propósito |
| `CORS_ORIGINS` | `src/config/seguranca.js` | não | Origens autorizadas a chamar a API, separadas por vírgula. Vazio = nenhuma origem cruzada (NF007) |

> `JWT_SECRET` e `SESSION_SECRET` são chaves distintas de propósito: o site usa
> sessão com cookie (`express-session`) e a API usa token JWT. Comprometer uma
> não compromete a outra.

---

## 3. Banco de dados

Com o MySQL Server no ar e o banco `sga_ti` criado:

```cmd
npm run db:mysql:client
npm run db:mysql
npm run seed
```

| Comando | O que faz |
|---|---|
| `db:mysql:client` | Gera o Prisma Client a partir de `prisma/schema.prisma` |
| `db:mysql` | Aplica as migrations versionadas (`prisma migrate deploy`) |
| `seed` | Cria os 7 perfis e o usuário `admin` |
| `seed:demo` | O mesmo, **mais um usuário por perfil** (ver seção 5) |
| `backup` | NF006 — gera um dump do MySQL em `./backups` (ver `docs/BACKUP.md`) |
| `reparar:anonimizacoes` | NF008 — limpa contas e log de clientes anonimizados antes de 14/10/2026 (ver `docs/RETENCAO.md`, seção 3.4) |
| `simular:entrega` | Módulo 6 — move o entregador da saída em rota por um trajeto de Dourados, sem GPS (ver seção 4, "Demonstração do Módulo 6") |

### As oito migrations

| Migration | O que acrescenta |
|---|---|
| `20260804231127_inicial` | Schema dos Módulos 1 a 3: perfis, usuários, clientes, equipamentos, ordens de serviço e serviços executados |
| `20260817133444_modulo4_financeiro_estoque` | Módulo 4: `produtos`, `movimentos_estoque`, `itens_ordem`, `contas_pagar`, `contas_receber`, e as colunas `clientes.bairro`, `movimentos_estoque.usuarioId` e `quitadaPorId` |
| `20260825120000_modulo5_relatorios` | Módulo 5: `tipos_servico`, `equipamentos.tipo` e `itens_ordem.criadoEm` |
| `20261005120000_nf005_auditoria` | NF005: `logs_auditoria` e o enum `AcaoAuditoria` |
| `20261006120000_nf008_retencao` | NF008: `equipamentos.ativo` e `clientes.anonimizadoEm` |
| `20261013120000_perfil_nome_unico` | Torna `perfis.nomePerfil` único — ver aviso abaixo |
| `20261016120000_modulo6_entregas` | Módulo 6: `saidas_entrega`, `entregas_os`, `posicoes_entrega` e os enums `StatusSaida` e `StatusEntrega`. Tabelas novas; nenhuma existente muda |
| `20261015120000_tecnico_e_peca_do_servico` | `servicos_executados.usuarioId` (quem executou) e `itens_ordem.servicoId` (serviço em que a peça foi usada). Colunas opcionais, sem preenchimento retroativo |

As três primeiras já foram aplicadas num servidor MySQL real, em banco vazio, com o
`prisma migrate diff` do resultado contra o schema voltando vazio. Detalhes em
`docs/LEIAME-MODULO5.md`, seção 8.1.

> **Atenção na migration `20261013120000_perfil_nome_unico`:** se o banco já em
> uso tiver nome de perfil repetido, ela falha. Conferir antes com
> `SELECT nomePerfil, COUNT(*) FROM perfis GROUP BY nomePerfil HAVING COUNT(*) > 1;`

> Se você já tinha um banco criado à mão, antes de as migrations serem
> versionadas, marque a primeira como aplicada para o Prisma não tentar recriar
> as tabelas:
>
> ```cmd
> npx prisma migrate resolve --applied 20260804231127_inicial
> npm run db:mysql
> ```

---

## 4. Subir o sistema

```cmd
npm run dev     :: com reload automático (nodemon)
npm start       :: sem reload
```

Acesse `http://localhost:3000`.

A consulta pública de OS fica em `http://localhost:3000/consulta` e **não pede
login** — é a tela que o cliente usa para acompanhar o conserto pelo número da OS.

### Demonstração do Módulo 6 (entrega no mapa)

A posição do entregador pode vir de três jeitos. O sistema funciona igual nos
três; muda só o que aparece no mapa.

| Jeito | Quando usar | O que precisa |
|---|---|---|
| **Simulador** | Apresentação, sala sem sinal de GPS | Só o computador |
| **GPS do celular** | Uso real; demonstração ao ar livre | HTTPS (o celular só libera o GPS em `https://` ou `localhost`): túnel `cloudflared` ou o deploy no Render. O marcador só anda se o celular andar |
| **Sem posição** | Mostrar só o fluxo da saída | Nada. O painel mostra os destinos e "O entregador ainda não enviou a localização"; o cliente vê "Aguardando a primeira localização" |

**Roteiro com o simulador:**

1. Entrar como `entregador`, marcar as OS em `/entregas/saida` e clicar em
   **Iniciar saída**. Para o trajeto de demonstração, escolher primeiro a OS da
   Padaria Pão Quente e depois a de Marcos Aurélio Soares, que são as paradas 1 e 2
   dele. Com outros clientes, o trajeto roda igual, mas não passa pelos pinos.
2. Num terminal:

   ```cmd
   npm run simular:entrega -- --intervalo 3
   ```

   | Opção | Padrão | O que faz |
   |---|---|---|
   | `--intervalo N` | 10 | Segundos entre uma posição e outra (o celular usa 10). Com 3, o trajeto inteiro leva uns 6 min |
   | `--pausa N` | 30 | Segundos parado em cada parada |
   | `--repetir` | não | Recomeça o trajeto até a saída sair de rota |
   | `--trajeto arquivo` | `scripts/trajetos/dourados-demo.json` | Outro trajeto, gerado como abaixo |
   | `--confirmar` | — | Exigido com `NODE_ENV=production`: lá o cliente veria um entregador simulado |

3. Em outra janela, como `admin`, abrir `/entregas`: o mapa acompanha a cada 10 s.
   Na consulta pública, o número da OS e os 4 últimos dígitos do telefone do
   cliente mostram o mapa dele.
4. Ao chegar a cada parada, marcar **Entregue** na tela da saída. No fim,
   **Encerrar saída**. O simulador para sozinho quando a saída deixa de estar em
   rota, e com Ctrl+C a qualquer momento.

Não deixe o celular do entregador enviando GPS ao mesmo tempo: o marcador pularia
entre as duas posições (o simulador avisa se isso acontecer).

**Outro trajeto.** O trajeto é a rota de carro do OSRM sobre o OpenStreetMap,
reamostrada a cada ~70 m. Para gerar um novo, com rede, uma única vez:

```cmd
node scripts/gerar-trajeto.js --partida -22.2211,-54.8056 --parada LAT,LNG --parada LAT,LNG --saida scripts/trajetos/novo.json
```

As coordenadas das paradas são as que a geocodificação gravou em
`entregas_os.destinoLat/destinoLng`. A partida do trajeto atual é o centro de
Dourados `[VALIDAR: trocar pelo endereço da Lelo Informática]`.

---

## 5. Usuários e perfis

### O que o seed cria

`npm run seed` cria os **7 perfis** e **um único usuário**:

| Login | Senha | Perfil |
|---|---|---|
| `admin` | `admin123` | `ADMINISTRADOR` |

Para criar **um usuário por perfil**, use o comando próprio:

```cmd
npm run seed:demo
```

| Login | Senha | Perfil |
|---|---|---|
| `admin` | `admin123` | `ADMINISTRADOR` |
| `atendente` | `admin123` | `ATENDENTE` |
| `tecnico` | `admin123` | `TECNICO` |
| `vendedor` | `admin123` | `VENDEDOR` |
| `financeiro` | `admin123` | `FINANCEIRO` |
| `compras` | `admin123` | `COMPRAS` |

> Os usuários de demonstração ficam atrás de um comando próprio **de propósito**.
> Criar seis contas com senha conhecida é aceitável numa máquina de demonstração
> e inaceitável em produção — e um seed que faz isso por padrão acaba rodando em
> produção mais cedo ou mais tarde. Ambos os comandos são idempotentes: rodar
> duas vezes não duplica nada.

O `ADMINISTRADOR` enxerga e executa tudo, então esse usuário basta para subir o
sistema e navegar. Ele **não** basta para testar o controle de acesso: o RF023 só
aparece quando se entra com um perfil restrito e se vê o menu encolher.

### O que cada perfil faz

A suíte de integração usa exatamente esses seis logins
(`tests/helpers/fixture.js`).

| Login sugerido | Perfil | O que esse perfil pode fazer no sistema |
|---|---|---|
| `admin` | `ADMINISTRADOR` | Tudo. Único que exclui cliente, fatura OS, gerencia usuários, tipos de serviço, relatórios e **auditoria** |
| `atendente` | `ATENDENTE` | Clientes, equipamentos, abrir e consultar OS, registrar a resposta do cliente ao orçamento |
| `tecnico` | `TECNICO` | Mudar status da OS, registrar serviços executados e garantia, consultar histórico do equipamento |
| `vendedor` | `VENDEDOR` | Lançar orçamento, lançar peças na OS, consultar produtos e OS |
| `financeiro` | `FINANCEIRO` | Contas a pagar e a receber: criar, editar, quitar e cancelar |
| `compras` | `COMPRAS` | Cadastro de produtos e movimentação de estoque (RF015) |

> A regra de acesso está em `src/middlewares/perfilMiddleware.js` e é declarada
> rota a rota em `src/routes/webRoutes.js`. O `ADMINISTRADOR` passa em todas sem
> precisar ser listado.

> ~~Decidir se o seed deve criar os seis usuários~~ — **resolvido**: criado o
> comando `npm run seed:demo`, que não roda por padrão.

---

## 6. Testes

```cmd
npm run test:unit         :: 424 testes unitários (regras de negócio, Prisma mockado)
npm run test:integration  :: 385 testes de integração (rota, sessão, JWT e banco)
npm test                  :: suíte completa — 809 testes, todos passando
```

Resultado atual na `main` consolidada:

| Suíte | Passando | Falhando |
|---|---|---|
| Unitários | **243** | 0 |
| Integração | **261** | 0 |

### Banco dos testes

Os testes de integração apagam e recriam tabelas, então **nunca** usam o banco de
trabalho. `tests/helpers/ambiente.js` direciona a conexão para um banco separado e
**aborta** se a URL apontar para um banco de desenvolvimento. O schema é criado
automaticamente antes da suíte (`tests/globalSetup.js`), que escolhe o schema pelo
protocolo da URL — `file:` para SQLite, qualquer outro para MySQL.

Para rodar contra MySQL, aponte para um banco **vazio**:

```cmd
set TEST_DATABASE_URL=mysql://usuario:senha@localhost:3306/sga_ti_teste
npm run test:integration
```

### O que cada suíte cobre

| Arquivo | Cobre |
|---|---|
| `tests/unit/` | Regras dos services: orçamento, garantia, estoque, itens da OS, financeiro, relatórios, CSV e histórico do equipamento |
| `tests/integration/perfis.test.js` | Controle de acesso dos 7 perfis (RF022/RF023) |
| `tests/integration/rastreio.test.js` | Módulo 6: o cliente acompanha a entrega — dígitos, limites, token, posição pública, WhatsApp (RN26–RN32) |
| `tests/integration/entregas.test.js` | Módulo 6: saída de entrega, posição, paradas, cancelamento e auditoria (RN15–RN25); painel do administrador (RN33–RN34) |
| `tests/integration/simulador.test.js` | Módulo 6: simulador de entrega contra o banco — ordem dos pontos, saída cancelada no meio, auditoria, painel |
| `tests/integration/modeloEntregas.test.js` | Módulo 6: regras que o banco garante nas entregas e o perfil ENTREGADOR |
| `tests/integration/estoque.test.js` | Movimentações, saldo × razão, peças na OS (RF014/RF015) |
| `tests/integration/financeiro.test.js` | Contas a pagar/receber e a conta gerada no encerramento (RF020/RF021) |
| `tests/integration/garantia.test.js` | Serviços executados e garantia (Módulo 3) |
| `tests/integration/historicoEquipamento.test.js` | Histórico de serviços por equipamento (RF012) |
| `tests/integration/api.test.js` | API REST de produtos e financeiro, com JWT (Módulo 4) |
| `tests/integration/relatorios.test.js` | Relatórios gerenciais por período (RF016/RF018) |
| `tests/integration/tiposServico.test.js` | Catálogo de tipos e classificação (RF017/RF019) |
| `tests/integration/dashboard.test.js` | Dashboards por perfil e exportação CSV (UC RF008) |
| `tests/integration/auditoria.test.js` | Log de auditoria, acesso e somente-leitura (NF005) |
| `tests/integration/seguranca.test.js` | Cabeçalhos, cookie, CORS e limites de tentativas (NF007) |
| `tests/integration/csrf.test.js` | Token CSRF, regeneração da sessão no login e Sair por POST (NF007) |
| `tests/integration/retencao.test.js` | Anonimização LGPD e exclusão lógica (NF008) |
| `tests/integration/clientes.test.js` | API de clientes (Módulo 1) |

### Situação da suíte

**Os 809 testes passam**, inclusive `npm test`. Até 14/10/2026 o
`tests/integration/auth.test.js` falhava nos seus 3 casos por ter sido escrito
contra um schema antigo (`usuario.email`); foi reescrito contra o schema real.

---

## 7. Pendências conhecidas de ambiente

- O `.env` não vai para o repositório (correto). Quem clonar precisa criar o seu,
  conforme a seção 2.
- ~~Não há integração contínua~~ — resolvido: `.github/workflows/ci.yml` roda as
  duas suítes a cada push e a cada pull request, **contra um MySQL 8 de
  verdade**, e falha o build se as migrations divergirem do `schema.prisma`.
  Ver `docs/DEPLOY.md`.
- O deploy está configurado (`render.yaml`) mas **ainda não foi executado**.
  Ver `docs/DEPLOY.md`, pendência P01.
