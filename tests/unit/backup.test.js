const backup = require('../../scripts/backup');

/**
 * NF006 — rotina de backup.
 *
 * O dump em si depende do `mysqldump` instalado e de um MySQL no ar, o que
 * não existe no ambiente de desenvolvimento. O que dá para provar aqui é a
 * parte que erra calado se estiver errada: a leitura da URL de conexão, o nome
 * do arquivo e os argumentos passados ao processo.
 */

describe('lerConexao', () => {
  test('quebra a URL do Prisma nas partes do mysqldump', () => {
    const c = backup.lerConexao('mysql://sga:segredo@db.exemplo.com:3307/sga_ti');

    expect(c).toEqual({
      host: 'db.exemplo.com', porta: '3307',
      usuario: 'sga', senha: 'segredo', banco: 'sga_ti',
    });
  });

  test('assume a porta 3306 quando a URL não traz porta', () => {
    expect(backup.lerConexao('mysql://root:@localhost/sga_ti').porta).toBe('3306');
  });

  test('senha com caractere especial é decodificada corretamente', () => {
    // `p@ss:w/rd` percent-encoded. Uma regex ingênua quebraria no @ e no /.
    const c = backup.lerConexao('mysql://root:p%40ss%3Aw%2Frd@localhost:3306/sga_ti');
    expect(c.senha).toBe('p@ss:w/rd');
    expect(c.host).toBe('localhost');
    expect(c.banco).toBe('sga_ti');
  });

  test('sem DATABASE_URL, a mensagem aponta onde configurar', () => {
    expect(() => backup.lerConexao(undefined)).toThrow(/DATABASE_URL não definida/);
    expect(() => backup.lerConexao('')).toThrow(/COMO-RODAR/);
  });

  test('URL de SQLite é recusada com explicação, não com erro genérico', () => {
    expect(() => backup.lerConexao('file:./dev.db')).toThrow(/SQLite|copiar o arquivo/);
  });

  test('URL sem nome de banco é recusada', () => {
    expect(() => backup.lerConexao('mysql://root:x@localhost:3306/')).toThrow(/nome do banco/);
  });

  test('texto que não é URL é recusado', () => {
    expect(() => backup.lerConexao('isto nao e uma url')).toThrow(/inválida/);
  });
});

describe('nomeDoArquivo', () => {
  test('usa o nome do banco, a data e a hora', () => {
    const nome = backup.nomeDoArquivo('sga_ti', new Date(2026, 9, 6, 14, 30, 5));
    expect(nome).toBe('sga_ti-2026-10-06_14-30-05.sql');
  });

  test('zera à esquerda para o nome ordenar alfabeticamente', () => {
    const nome = backup.nomeDoArquivo('sga_ti', new Date(2026, 0, 2, 3, 4, 5));
    expect(nome).toBe('sga_ti-2026-01-02_03-04-05.sql');
  });

  test('monta a data no fuso LOCAL, não em UTC', () => {
    // 6/10 às 22h no horário do Brasil já é dia 7 em UTC. Com toISOString o
    // arquivo sairia com a data errada — mesmo defeito do nome do CSV (D02 do
    // Módulo 5).
    const noite = new Date(2026, 9, 6, 22, 0, 0);
    expect(backup.nomeDoArquivo('sga_ti', noite)).toContain('2026-10-06');
  });
});

describe('montarArgumentos', () => {
  const conexao = {
    host: 'localhost', porta: '3306', usuario: 'root', senha: 'segredo', banco: 'sga_ti',
  };

  test('a senha NUNCA vai por argumento', () => {
    const args = backup.montarArgumentos(conexao);
    expect(args.join(' ')).not.toContain('segredo');
    expect(args.some((a) => a.startsWith('--password'))).toBe(false);
  });

  test('usa --single-transaction para não travar as tabelas', () => {
    expect(backup.montarArgumentos(conexao)).toContain('--single-transaction');
  });

  test('o banco é o último argumento', () => {
    const args = backup.montarArgumentos(conexao);
    expect(args[args.length - 1]).toBe('sga_ti');
  });

  test('host, porta e usuário são repassados', () => {
    const args = backup.montarArgumentos(conexao);
    expect(args).toContain('--host=localhost');
    expect(args).toContain('--port=3306');
    expect(args).toContain('--user=root');
  });

  test('conexão sem usuário não gera --user vazio', () => {
    const args = backup.montarArgumentos({ ...conexao, usuario: '' });
    expect(args.some((a) => a.startsWith('--user'))).toBe(false);
  });
});
