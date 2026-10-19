# SGA TI — Módulo 6: Rastreamento de entregas em mapa

**Branches:** uma por etapa, de `fix/limite-consulta-publica` a `docs/modulo6` (ver seção 10)
**Versão:** V01
**Data:** 19/10/2026

O cliente acompanha num mapa o equipamento consertado sendo levado até ele. Um
entregador na rua por vez, levando uma ou mais OS por saída. O administrador
acompanha num painel; o cliente, pela consulta pública que já existia.

---

## 1. Requisitos atendidos

`[VALIDAR: numeração]` — a monografia não estava disponível (ver
`MATRIZ-REQUISITOS.md`, seção 0). Os números continuam a sequência conhecida.

| Requisito | Onde |
|---|---|
| RF024 — registrar saída para entrega com uma ou mais OS finalizadas | `entregaService.iniciarSaida`, tela `/entregas/saida` |
| RF025 — compartilhar a localização do entregador durante a saída | `public/js/entregador.js`, `entregaService.registrarPosicao` |
| RF026 — registrar a conclusão de cada entrega (entregue, não entregue, encerrar, cancelar) | `entregaService.marcarEntrega`, `encerrarSaida`, `cancelarSaida` |
| RF027 — o cliente acompanha a entrega no mapa pela consulta pública | `rastreioService`, `public/js/rastreio.js`, `views/ordens/consulta-publica.ejs` |
| RF028 — painel de entregas do administrador | `/entregas`, `views/entregas/painel.ejs`, `public/js/painel-entregas.js` |
| NF009 — privacidade da localização: só durante a rota, segundo fator, token só como hash, retenção e anonimização | `rastreioService`, `retencaoService`, `docs/SEGURANCA.md` 4.4, `docs/RETENCAO.md` 3.5 |

---

## 2. O que foi achado antes de começar

O número da OS tem só **um milhão de combinações** (os 6 últimos dígitos de
`Date.now()`), e `POST /consulta` não tinha limite de tentativas: dava para
testar números em sequência e ler status, equipamento, orçamento e serviços de
OS alheias. Com o mapa, exporia também **onde está o entregador**.

Como o repositório é público, a defesa veio **antes** de qualquer documento
descrever o problema: a Etapa 1 limitou a consulta a 10 erros por IP em
15 minutos. A numeração não mudou, porque mexe em número já emitido; fica como
P08 em `SEGURANCA.md`. O mapa ganhou um segundo fator (seção 5).

### Decisões

| Decisão | Por quê |
|---|---|
| Perfil novo **ENTREGADOR** (sete perfis em vez de seis) | Quem anda na rua com o celular logado não deve ver o caixa nem os cadastros. O entregador vai direto do login para a tela de entregas |
| `StatusOS` **não muda**; o estado da entrega fica nas tabelas novas | Mexer no enum afetaria relatórios, dashboards e testes que já funcionavam |
| RN13 e RN14 garantidas **pelo banco**, com índice único numa coluna que só tem valor enquanto a regra vale | Checar só no código não basta: dois toques em "Iniciar saída" abrem duas transações que leriam "nenhuma em rota" antes de gravar |
| Geocodificação **depois** de iniciar a saída, em segundo plano | O entregador não espera até ~5 s por OS para sair; o pino aparece quando a coordenada chega |
| Nominatim chamado **no servidor**, fila de 1 requisição/s, sem o CEP quando há cidade | Política de uso do serviço; e, com o CEP genérico da cidade, uma rua existente não era encontrada (visto com o serviço real) |
| `PosicaoEntrega` **fora da auditoria** | Uma linha a cada ~10 s multiplicaria o log sem dizer quem alterou o quê; os eventos da saída continuam auditados |
| Aviso ao cliente pelo **botão `wa.me`**, envio manual (opção A, 16/10/2026) | Grátis, sem conta Meta nem custo por conversa; nenhum dado do cliente sai do sistema para um serviço de mensagens |
| Leaflet servido pelo próprio sistema; só os tiles vêm do OpenStreetMap | `script-src` continua `'self'`; `img-src` libera uma única origem externa |
| Fila de posições **no processo** (RN21) | O sistema roda numa instância só, a mesma premissa da sessão em memória (P04 em `SEGURANCA.md`) |
| Simulador de entrega para a banca | Não depender de sinal de GPS dentro da sala |
| Anular a coordenada na anonimização, em vez de reduzir a precisão; o trajeto da saída sai inteiro (18/10/2026) | Com 2 casas decimais ainda se sabe o bairro; recortar o trajeto por raio seria mais difícil de acertar |

---

## 3. Modelo de dados

Migration `20261016120000_modulo6_entregas` (a oitava). Três tabelas novas, dois
enums; nenhuma tabela existente muda. Chaves `RESTRICT`, como no resto do
projeto. Detalhes em `DER.md`, seções 5.14 a 5.16.

| Tabela | Granularidade |
|---|---|
| `saidas_entrega` | Uma viagem do entregador. `emRota` só tem valor enquanto a saída está em rota (RN13) |
| `entregas_os` | Uma OS dentro da saída — uma parada. `ordemPendenteId` só tem valor enquanto pendente (RN14); `tokenHash` guarda o SHA-256 do token do cliente; `destinoLat/Lng` é a coordenada geocodificada |
| `posicoes_entrega` | Uma posição do entregador durante a saída |

---

## 4. Regras de negócio

O texto completo de cada regra está em `DER.md`, seção 5. Resumo:

| Regras | Assunto |
|---|---|
| RN13–RN14 | Uma saída em rota por vez; OS em uma só entrega pendente — garantidas pelo banco |
| RN15–RN18 | Só OS finalizada, tudo ou nada; a lista mostra as faturadas nos últimos 30 dias `[VALIDAR]`; o entregador é o usuário logado |
| RN19–RN21 | Posição só na saída em rota e só do entregador dela, com lat/lng válidos; a menos de 5 s da anterior é descartada sem erro |
| RN22–RN25 | Marcar entregue ou não entregue (com motivo); encerrar exige nenhuma pendente; só o administrador cancela |
| RN26–RN32 | Consulta pública: bloco só com a OS em rota; 4 dígitos com limite duplo; token só como hash; resposta mínima com 404 genérico; "Entregue em" no fuso de Dourados |
| RN33–RN34 | Painel só do administrador; o mapa leva só número da parada, OS, coordenada e status |
| RN35–RN38 | Trajeto e destino apagados 30 dias depois do fim da saída `[VALIDAR]`; anonimização alcança destino, motivo, log e trajeto; cliente com entrega pendente não é anonimizado |

**Sobre a numeração:** as RN do Módulo 6 continuam a numeração do `DER.md`
(RN13 em diante). Outros documentos têm numerações próprias — RN01–RN12 do
Módulo 3, RN01–RN07 do `RETENCAO.md`, RN01–RN09 do `AUDITORIA.md`. Ao levar para
a monografia, convém prefixar por módulo `[VALIDAR]`.

---

## 5. Telas

### Entregador — `/entregas/saida` (celular primeiro)

- Sem saída: as OS finalizadas para escolher, e **Iniciar saída**.
- Em rota: um cartão por parada, com **Navegar** (abre o app de mapas do
  celular), **Entregue**, **Não entregue** (com motivo) e **Avisar no WhatsApp**;
  no fim, **Encerrar saída**.
- O GPS (`watchPosition`) envia a posição a cada 10 s, com uma faixa "enviada há
  X s" em verde, amarelo ou vermelho e mensagens para página sem HTTPS,
  permissão negada, sem sinal e falha de envio.
- **Wake Lock** para a tela não apagar; onde o navegador não suporta, um aviso
  pede para manter a tela acesa.

### Cliente — dentro da consulta pública

- Com a OS em rota: "Seu equipamento saiu para entrega" e o pedido dos 4 últimos
  dígitos do telefone cadastrado.
- Acertou: mapa com o entregador e o destino, atualizado a cada 10 s.
- Entregue: "Entregue em DD/MM às HH:MM", e o mapa some.

### Administrador — `/entregas`

- Saída em rota: mapa com o entregador e um pino numerado por destino, na cor do
  status; tabela das paradas; **Cancelar saída**. Atualiza a cada 10 s sem
  recarregar e avisa quando a saída sai de rota ou a sessão expira.
- Histórico das 50 saídas mais recentes, com a contagem por resultado.

Capturas no `APENDICE-B-MANUAL.md` (34 a 40).

---

## 6. Segurança e LGPD

Resumo; o detalhe está em `SEGURANCA.md` (4.3 e 4.4) e `RETENCAO.md` (3.3 e 3.5).

- **Consulta pública:** 10 erros por IP em 15 min (Etapa 1).
- **Mapa do cliente:** segundo fator (4 dígitos) com 5 erros por IP em 15 min e
  10 por OS em 3 h; token de 32 bytes, só o SHA-256 no banco; resposta mínima,
  404 genérico; o token morre quando a entrega é marcada ou a saída acaba.
- **Painel e posição do painel:** só o administrador (RN33).
- **CSP:** `img-src` aceita só `https://tile.openstreetmap.org`; Leaflet servido
  pelo sistema; scripts em `public/js/`, sem script embutido.
- **Localização como dado pessoal:** a coordenada do destino identifica a casa.
  Ela se espalhava por mais lugares do que o pedido original previa — a entrega,
  o log de auditoria (a geocodificação grava pela auditoria, e cada alteração
  seguinte copia o registro inteiro), o motivo da não entrega e o trajeto, que
  termina na porta do cliente. A anonimização alcança os quatro (RN37), e o
  teste procura a coordenada **no banco inteiro**.
- **Retenção:** trajeto e destino saem 30 dias depois do fim da saída
  `[VALIDAR]`, sozinhos a cada saída iniciada (não há agendador, e o Render
  gratuito não tem cron) ou por `npm run retencao:entregas`.

---

## 7. Arquivos

| Assunto | Arquivo |
|---|---|
| Regras da saída e do painel | `src/services/entregaService.js` |
| Geocodificação | `src/services/geocodificacaoService.js` |
| Rastreio do cliente e WhatsApp | `src/services/rastreioService.js`, `src/controllers/rastreioWebController.js` |
| Retenção e anonimização da entrega | `src/services/retencaoService.js` |
| Telas e ações | `src/controllers/entregaWebController.js`, `views/entregas/saida.ejs`, `views/entregas/painel.ejs`, `views/ordens/consulta-publica.ejs` |
| Scripts do navegador | `public/js/entregador.js`, `public/js/rastreio.js`, `public/js/painel-entregas.js` |
| Limites e CSP | `src/config/seguranca.js` |
| Simulador e trajeto | `scripts/simular-entrega.js`, `scripts/gerar-trajeto.js`, `scripts/trajetos/dourados-demo.json` |
| Retenção à mão | `scripts/retencao-entregas.js` |
| Modelo | `prisma/schema.prisma`, `prisma/migrations/20261016120000_modulo6_entregas/` |

Comandos novos: `npm run simular:entrega` e `npm run retencao:entregas` (ver
`COMO-RODAR.md`).

---

## 8. Testes

A suíte passou de **575 para 836 testes**: 435 unitários e 401 de integração,
todos passando no SQLite local e no MySQL 8 do CI.

| Arquivo | Casos | O que cobre |
|---|---|---|
| `unit/entregaService.test.js` | 36 | RN15–RN25, painel, limpeza ao iniciar a saída |
| `unit/geocodificacaoService.test.js` | 15 | Nominatim: sucesso, falha, timeout, fila |
| `unit/rastreioService.test.js` | 24 | WhatsApp, 4 dígitos, token |
| `unit/entregadorScript.test.js` | 26 | Mensagens do GPS, reação às respostas, trava contra rajada |
| `unit/painelEntregasScript.test.js` | 8 | Texto da posição, sessão expirada, cor do pino |
| `unit/simuladorEntrega.test.js` | 29 | Argumentos, trava de produção, trajeto, pausa, outra fonte de GPS |
| `unit/retencaoService.test.js` (parte do módulo) | 9 | Coordenada no log, corte dos 30 dias, RN38 |
| `integration/modeloEntregas.test.js` | 20 | RN13, RN14, RESTRICT, perfil ENTREGADOR |
| `integration/entregas.test.js` | 49 | Fluxo da saída, perfis, auditoria, tela do entregador, painel, fuso |
| `integration/rastreio.test.js` | 17 | Consulta com entrega, limites por IP e por OS, token, 404, WhatsApp |
| `integration/simulador.test.js` | 6 | Simulador contra o banco |
| `integration/retencaoEntregas.test.js` | 13 | A coordenada não sobrevive à anonimização; retenção em 30 dias |

Mais casos acrescentados aos testes de perfis, API, segurança e CSRF.

**Todo teste novo foi visto falhar sem a correção.** O método: desligar a regra
com uma mutação pequena, rodar o teste dela e restaurar. Quando a mutação não
derrubava nenhum teste, o problema era o teste — aconteceu com o limite por OS
(nos testes todos vêm do mesmo IP), com a contagem do histórico (os dados
tinham contagens iguais), com o aviso do simulador e com o fuso (no Jest, trocar
o `TZ` dentro do arquivo não tem efeito; a suíte passou a rodar em UTC).

**No navegador**, conferido em cada etapa: tiles, ícones e marcadores sem erro
de CSP, 375 px, atualização ao vivo, fim do acompanhamento. **Celular real**
(Etapa 4, `TESTES.md` 3.9) e **demonstração inteira sem GPS** com o simulador
(`TESTES.md` 3.11).

---

## 9. Defeitos encontrados e corrigidos

Quase todos apareceram **no navegador ou no aparelho**, não nos testes — e cada
um ganhou um teste depois, quando havia como testar.

| Etapa | Defeito | Onde apareceu |
|---|---|---|
| 3 | Com o CEP genérico da cidade, o Nominatim não achava uma rua existente; sem o CEP, achava | Navegador, serviço real |
| 4 | Com a saída encerrada, a faixa do GPS voltava ao verde "enviada há 10 s" | Navegador |
| 4 | **Rajada ao desbloquear a tela:** três posições gravadas no mesmo milissegundo, furando o RN21. Corrigido no servidor (fila por saída) e no celular (um envio por vez) | Celular real |
| 5 | Funcionário logado no mesmo navegador levava 403 do CSRF na consulta pública | Navegador |
| 5 | Mapa aberto com a aba escondida desenhava só um canto | Navegador |
| 6 | Número fora do centro no pino do mapa (o `leaflet.css` força `display: block`) | Navegador |
| 6 | Mapa desbotado com a aba em segundo plano (animação do zoom parada no meio) | Navegador |
| 6 | Sessão expirada sem aviso: o `fetch` seguia o redirecionamento e recebia o login com 200 | Navegador |
| 7 | Mensagens do simulador perdidas no log de SQL do Prisma em desenvolvimento | Rodando |
| 8 | A coordenada da casa do cliente sobrevivia à anonimização na entrega, no log, no motivo e no trajeto | Leitura do código, antes de implementar |
| 9 | Campo e botão dos 4 dígitos saindo do cartão em 375 px | Capturas do manual |
| 9 | Tela do entregador formatando hora e data no fuso do servidor | Capturas do manual |

---

## 10. Pendências e limitações conhecidas

| # | Item |
|---|---|
| L01 | **Com a tela bloqueada, o navegador para o GPS.** Medido no celular real: buracos de 45 e 50 s. Rastrear em segundo plano exigiria app nativo |
| L02 | A fila de posições vive no processo: vale para uma instância só, como a sessão (P04 em `SEGURANCA.md`) |
| L03 | O GPS só funciona em HTTPS ou `localhost`; o teste no celular usou túnel `cloudflared`. O deploy no Render ainda não foi feito |
| L04 | Uma saída em rota por vez (RN13): um entregador só, como na Lelo hoje |
| P01 | Firefox, Safari e outros aparelhos `[VALIDAR]`; modelo e navegador do celular do teste `[VALIDAR]` (`TESTES.md` 3.9) |
| P02 | Prazos `[VALIDAR]`: 30 dias para a OS aparecer ao entregador (RN16) e para o trajeto (RN35) |
| P03 | Mensagem a quem não tem telefone (RN31) e assinatura da loja na mensagem do WhatsApp `[VALIDAR]` |
| P04 | Partida do trajeto do simulador: centro de Dourados `[VALIDAR: endereço da Lelo Informática]` |
| P05 | Outras onze telas formatam data sem fuso `[VALIDAR: tela a tela ou TZ no deploy]` (`TESTES.md` 3.13) |
| P06 | OS de cliente anonimizado aparece na lista do entregador, sem endereço nem telefone `[VALIDAR]` |
| P07 | Numeração dos RFs, da NF009 e das RN ao levar para a monografia `[VALIDAR]` |

---

## 11. Histórico de versões

| Data | Commit | Etapa |
|---|---|---|
| 15/10/2026 | `d3a937b` | 1 — limite de tentativas na consulta pública |
| 16/10/2026 | `b563329` | 2 — modelo de dados e perfil ENTREGADOR |
| 16/10/2026 | `228bbed` | 3 — saída de entrega, regras e geocodificação |
| 16/10/2026 | `bf53bb5` | 4 — tela do entregador para celular |
| 16/10/2026 | `3714c6a` | 4 — correção da rajada de envios (celular real) |
| 16/10/2026 | `2964328` | 5 — mapa do cliente e aviso pelo WhatsApp |
| 17/10/2026 | `feb1e0c` | 6 — painel do administrador |
| 17/10/2026 | `b46bf76` | 7 — simulador de entrega |
| 18/10/2026 | `b2f3ad3` | 8 — retenção do trajeto e anonimização do destino |
| 19/10/2026 | `09ad142` | Correção: consulta no celular e fuso na tela do entregador |
| 19/10/2026 | — | 9 — esta documentação |

V01 — versão inicial, com validações pendentes (seção 10).
