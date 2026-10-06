const csv = require('../../src/services/csvService');

/**
 * Módulo 5 — geração de CSV (UC RF008, "exibido ou exportado").
 *
 * As regras aqui existem por causa do Excel em português: separador `;`,
 * decimal com vírgula e BOM para os acentos não quebrarem.
 */

describe('csvService', () => {
  describe('escapar', () => {
    test('valor simples passa direto', () => {
      expect(csv.escapar('Memória')).toBe('Memória');
    });

    test('valor com o separador é envolvido em aspas', () => {
      expect(csv.escapar('Peça; especial')).toBe('"Peça; especial"');
    });

    test('aspas internas são duplicadas', () => {
      expect(csv.escapar('Tela 15"')).toBe('"Tela 15"""');
    });

    test('quebra de linha é envolvida em aspas', () => {
      expect(csv.escapar('linha 1\nlinha 2')).toBe('"linha 1\nlinha 2"');
    });

    test('nulo e indefinido viram string vazia', () => {
      expect(csv.escapar(null)).toBe('');
      expect(csv.escapar(undefined)).toBe('');
    });
  });

  describe('numeroBR', () => {
    test('usa vírgula como separador decimal', () => {
      expect(csv.numeroBR(1234.5)).toBe('1234,50');
      expect(csv.numeroBR(0)).toBe('0,00');
    });

    test('valor ausente vira zero', () => {
      expect(csv.numeroBR(null)).toBe('0,00');
    });
  });

  describe('gerar', () => {
    const colunas = [
      { titulo: 'Produto', campo: 'produto' },
      { titulo: 'Qtd',     campo: 'quantidade' },
      { titulo: 'Total',   campo: 'total', tipo: 'numero' },
    ];

    test('monta cabeçalho e linhas separados por ponto e vírgula', () => {
      const saida = csv.gerar(colunas, [{ produto: 'Memória', quantidade: 2, total: 379.8 }]);
      const linhas = saida.replace(csv.BOM, '').trim().split('\r\n');

      expect(linhas[0]).toBe('Produto;Qtd;Total');
      expect(linhas[1]).toBe('Memória;2;379,80');
    });

    test('começa com BOM, senão o Excel estraga os acentos', () => {
      const saida = csv.gerar(colunas, []);
      expect(saida.charCodeAt(0)).toBe(0xFEFF);
    });

    test('lista vazia ainda traz o cabeçalho', () => {
      const linhas = csv.gerar(colunas, []).replace(csv.BOM, '').trim().split('\r\n');
      expect(linhas).toHaveLength(1);
      expect(linhas[0]).toBe('Produto;Qtd;Total');
    });

    test('campo com separador não desalinha as colunas', () => {
      const saida = csv.gerar(colunas, [{ produto: 'Cabo; flat', quantidade: 1, total: 45 }]);
      const linha = saida.replace(csv.BOM, '').trim().split('\r\n')[1];

      expect(linha).toBe('"Cabo; flat";1;45,00');
    });
  });

  describe('nomeArquivo', () => {
    test('usa a data local, não UTC', () => {
      // a data final vale até 23:59:59 — com toISOString viraria o dia seguinte
      const periodo = {
        de:  new Date(2026, 5, 1),
        ate: new Date(2026, 11, 31, 23, 59, 59, 999),
      };

      expect(csv.nomeArquivo('relatorio', periodo))
        .toBe('relatorio_2026-06-01_a_2026-12-31.csv');
    });
  });
});
