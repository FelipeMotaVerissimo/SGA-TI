# Documentação do SGA TI

Índice dos documentos do projeto, organizados por para que servem.

---

## Para levar ao documento do TCC

| Arquivo | Vai para | Situação |
|---|---|---|
| [CONCLUSAO.md](CONCLUSAO.md) | Capítulo 4 | Rascunho de 580 palavras — revisar e adaptar ao estilo do texto |
| [DER.md](DER.md) + [der.png](der.png) + [der-visao-geral.png](der-visao-geral.png) | Substitui a Figura 4 | 16 entidades, 6 enumerações, 21 relacionamentos |
| [MATRIZ-REQUISITOS.md](MATRIZ-REQUISITOS.md) | Rastreabilidade | RF001–RF023 e NF001–NF008 × código × teste |
| [APENDICE-A-USABILIDADE.md](APENDICE-A-USABILIDADE.md) | Apêndice A | Instrumento pronto, **ainda não aplicado** |
| [APENDICE-B-MANUAL.md](APENDICE-B-MANUAL.md) + [prints/](prints/) | Apêndice B | Manual por perfil, com 34 capturas em resolução de impressão. Falta só a do CSV aberto no Excel |
| [TESTES.md](TESTES.md) | Seção 1.6 | 699 testes passando; Chromium e celular medidos; usabilidade e demais navegadores em branco |
| [DIVERGENCIAS-DOC.md](DIVERGENCIAS-DOC.md) | Correções no texto | O que o documento afirma e o código não faz |

## Para rodar e manter o sistema

| Arquivo | Assunto |
|---|---|
| [COMO-RODAR.md](COMO-RODAR.md) | Instalação, variáveis de ambiente, banco, usuários e testes |
| [DEPLOY.md](DEPLOY.md) | Integração contínua e publicação (Render + Aiven) |
| [BACKUP.md](BACKUP.md) | NF006 — cópia de segurança e restauração |

## Decisões de projeto, por tema

| Arquivo | Assunto |
|---|---|
| [AUDITORIA.md](AUDITORIA.md) | NF005 — rastreabilidade das operações |
| [SEGURANCA.md](SEGURANCA.md) | NF007 — segurança na comunicação |
| [RETENCAO.md](RETENCAO.md) | NF008 — retenção e descarte, LGPD |

## Histórico por módulo

| Arquivo | Módulo |
|---|---|
| [LEIAME-MODULO3-PARTE2.md](LEIAME-MODULO3-PARTE2.md) | Serviços executados e garantia |
| [LEIAME-MODULO4.md](LEIAME-MODULO4.md) | Produtos, estoque, financeiro e perfis |
| [LEIAME-MODULO5.md](LEIAME-MODULO5.md) | Relatórios, dashboards, CSV e o RF012 |

---

## Convenção adotada

Marcações `[VALIDAR: ...]` indicam ponto que depende de decisão da dupla, do
orientador ou de informação que não estava disponível. **São de propósito:**
onde faltou informação, está escrito que faltou, em vez de preenchido por
suposição.
