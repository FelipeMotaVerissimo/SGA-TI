#!/usr/bin/env node
/**
 * NF006 — rotina de backup do banco.
 *
 * Gera um dump do MySQL com a data no nome, usando a mesma `DATABASE_URL` que a
 * aplicação. Não há credencial duplicada em lugar nenhum: se a aplicação
 * conecta, o backup conecta.
 *
 * Uso:
 *   npm run backup                 :: grava em ./backups
 *   npm run backup -- ./outra/pasta
 *
 * A restauração está documentada em docs/BACKUP.md.
 */

const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');

require('dotenv').config();

/**
 * Quebra a URL do Prisma nas partes que o `mysqldump` precisa.
 *
 * Feito com a classe `URL` em vez de expressão regular porque a senha pode
 * conter `@`, `:` e `/`, que quebram qualquer regex ingênua. `decodeURIComponent`
 * é necessário porque esses caracteres aparecem percent-encoded na URL.
 */
function lerConexao(url) {
  if (!url) {
    throw new Error(
      'DATABASE_URL não definida. Crie o .env conforme docs/COMO-RODAR.md, seção 2.'
    );
  }

  let partes;
  try {
    partes = new URL(url);
  } catch {
    throw new Error(`DATABASE_URL inválida: não é uma URL. Recebido: ${url}`);
  }

  if (!partes.protocol.startsWith('mysql')) {
    throw new Error(
      `O backup é de MySQL, mas DATABASE_URL aponta para "${partes.protocol.replace(':', '')}". ` +
      'O banco de desenvolvimento em SQLite é um arquivo: para copiá-lo, basta copiar o arquivo.'
    );
  }

  const banco = partes.pathname.replace(/^\//, '');
  if (!banco) throw new Error('DATABASE_URL não indica o nome do banco.');

  return {
    host:  partes.hostname,
    porta: partes.port || '3306',
    usuario: decodeURIComponent(partes.username || ''),
    senha:   decodeURIComponent(partes.password || ''),
    banco,
  };
}

/**
 * Nome do arquivo: `sga_ti-AAAA-MM-DD_HH-MM-SS.sql`.
 *
 * Montado campo a campo no fuso local, e **não** com `toISOString()`: o
 * `toISOString` converte para UTC e, à noite no horário do Brasil, o arquivo
 * sairia com a data do dia seguinte. É o mesmo defeito que já apareceu no nome
 * do CSV dos relatórios (D02 do Módulo 5).
 */
function nomeDoArquivo(banco, agora = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const data = `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
  const hora = `${p(agora.getHours())}-${p(agora.getMinutes())}-${p(agora.getSeconds())}`;
  return `${banco}-${data}_${hora}.sql`;
}

/**
 * Argumentos do `mysqldump`.
 *
 * `--single-transaction` faz o dump num snapshot consistente sem travar as
 * tabelas — em InnoDB, que é o caso, o sistema continua atendendo durante o
 * backup. Sem ele, um backup no horário comercial bloquearia o balcão.
 *
 * A senha **não** entra aqui: vai por variável de ambiente (ver `executar`),
 * porque argumento de processo é visível para qualquer um que liste os
 * processos da máquina.
 */
function montarArgumentos(conexao) {
  const args = [
    `--host=${conexao.host}`,
    `--port=${conexao.porta}`,
    '--single-transaction',
    '--routines',
    '--triggers',
    '--default-character-set=utf8mb4',
  ];
  if (conexao.usuario) args.push(`--user=${conexao.usuario}`);
  args.push(conexao.banco);
  return args;
}

/** Executa o dump e devolve o caminho do arquivo gerado. */
function executar(conexao, destino) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(destino, { recursive: true });

    const arquivo = path.join(destino, nomeDoArquivo(conexao.banco));
    const saida   = fs.createWriteStream(arquivo);

    const processo = spawn('mysqldump', montarArgumentos(conexao), {
      // MYSQL_PWD mantém a senha fora da lista de processos.
      env: { ...process.env, MYSQL_PWD: conexao.senha },
    });

    let erros = '';
    processo.stdout.pipe(saida);
    processo.stderr.on('data', (d) => { erros += d.toString(); });

    processo.on('error', (e) => {
      saida.destroy();
      if (e.code === 'ENOENT') {
        return reject(new Error(
          'mysqldump não encontrado no PATH.\n' +
          'Ele vem junto com o MySQL Server e com o MySQL Shell. ' +
          'No Windows costuma ficar em C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin.'
        ));
      }
      reject(e);
    });

    processo.on('close', (codigo) => {
      saida.end();
      if (codigo !== 0) {
        // Dump pela metade é pior que dump nenhum: dá falsa sensação de backup.
        try { fs.unlinkSync(arquivo); } catch { /* já não existe */ }
        return reject(new Error(`mysqldump terminou com código ${codigo}.\n${erros.trim()}`));
      }
      resolve(arquivo);
    });
  });
}

async function principal() {
  const destino = path.resolve(process.argv[2] || 'backups');
  const conexao = lerConexao(process.env.DATABASE_URL);

  console.log(`Banco   : ${conexao.banco} em ${conexao.host}:${conexao.porta}`);
  console.log(`Destino : ${destino}`);

  const arquivo = await executar(conexao, destino);
  const tamanho = (fs.statSync(arquivo).size / 1024).toFixed(1);

  console.log(`\nBackup concluído: ${path.basename(arquivo)} (${tamanho} KB)`);
  console.log('Restauração: ver docs/BACKUP.md, seção 3.');
}

// Só roda quando chamado direto. Importado pelos testes, não executa nada.
if (require.main === module) {
  principal().catch((e) => {
    console.error(`\n[ERRO] ${e.message}`);
    process.exit(1);
  });
}

module.exports = { lerConexao, nomeDoArquivo, montarArgumentos, executar };
