/**
 * Módulo 5 — geração de CSV.
 *
 * O UC RF008 diz "relatório exibido ou exportado". CSV foi a escolha: abre no
 * Excel e no LibreOffice, não adiciona dependência ao projeto e não precisa de
 * biblioteca de PDF.
 *
 * Duas decisões que existem por causa do Excel em português:
 *
 *  - separador `;` em vez de `,`. Num locale pt-BR o Excel usa a vírgula como
 *    separador decimal, e um arquivo separado por vírgula abre tudo numa
 *    coluna só;
 *  - BOM no início. Sem ele o Excel lê o arquivo como ANSI e "Serviço" vira
 *    "ServiÃ§o".
 */

const SEPARADOR = ';';

// Escrito como escape, e não como o caractere literal: U+FEFF é invisível no
// editor e some numa conversão de encoding sem ninguém perceber.
const BOM = '﻿';

/** Escapa um valor para CSV: aspas duplicadas e campo entre aspas quando preciso. */
function escapar(valor) {
  if (valor === null || valor === undefined) return '';

  const texto = String(valor);
  const precisaAspas = texto.includes(SEPARADOR)
    || texto.includes('"')
    || texto.includes('\n')
    || texto.includes('\r');

  if (!precisaAspas) return texto;
  return `"${texto.replace(/"/g, '""')}"`;
}

/** Número no formato brasileiro: 1234.5 -> "1234,50". */
function numeroBR(valor, casas = 2) {
  return Number(valor || 0).toFixed(casas).replace('.', ',');
}

/**
 * Monta o CSV.
 *
 * @param colunas [{ titulo, campo, tipo }] — tipo 'numero' formata em pt-BR
 * @param linhas  array de objetos
 */
function gerar(colunas, linhas) {
  const cabecalho = colunas.map((c) => escapar(c.titulo)).join(SEPARADOR);

  const corpo = linhas.map((linha) =>
    colunas
      .map((c) => {
        const valor = linha[c.campo];
        return escapar(c.tipo === 'numero' ? numeroBR(valor) : valor);
      })
      .join(SEPARADOR)
  );

  return BOM + [cabecalho, ...corpo].join('\r\n') + '\r\n';
}

/**
 * Nome de arquivo com o período, para o gestor não confundir dois downloads.
 *
 * A data é montada campo a campo, no fuso local. Com `toISOString()` a data
 * final — que vale até 23:59:59 — virava o dia seguinte em UTC, e o arquivo de
 * um relatório "até 31/12" saía nomeado "a_2027-01-01".
 */
function nomeArquivo(base, periodo) {
  const local = (valor) => {
    const d = new Date(valor);
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`;
  };

  return `${base}_${local(periodo.de)}_a_${local(periodo.ate)}.csv`;
}

module.exports = { SEPARADOR, BOM, escapar, numeroBR, gerar, nomeArquivo };
