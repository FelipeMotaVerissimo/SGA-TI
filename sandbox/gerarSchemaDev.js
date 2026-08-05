/**
 * SGA TI — Gera prisma/schema.dev.prisma (SQLite) a partir de prisma/schema.prisma (MySQL).
 *
 * Rode sempre que o schema.prisma mudar:
 *     node sandbox/gerarSchemaDev.js
 *
 * O schema original NÃO é alterado. O de desenvolvimento é um arquivo derivado
 * e pode ser apagado a qualquer momento.
 *
 * Diferenças aplicadas:
 *  1. provider "mysql" -> "sqlite"
 *  2. url env("DATABASE_URL") -> env("DEV_DATABASE_URL")
 *  3. atributos nativos (@db.VarChar, @db.Text, @db.Char, @db.Decimal) removidos —
 *     o SQLite não os suporta
 *  4. enums viram String — o SQLite do Prisma não suporta enum; o campo passa a
 *     String com o mesmo @default
 */

const fs = require('fs');
const path = require('path');

const RAIZ    = path.join(__dirname, '..');
const ORIGEM  = path.join(RAIZ, 'prisma', 'schema.prisma');
const DESTINO = path.join(RAIZ, 'prisma', 'schema.dev.prisma');

let schema = fs.readFileSync(ORIGEM, 'utf8');

// 1 e 2 — datasource
schema = schema.replace(/provider\s*=\s*"mysql"/, 'provider = "sqlite"');
schema = schema.replace(/env\("DATABASE_URL"\)/, 'env("DEV_DATABASE_URL")');

// 4a — descobre os enums (nome + valores) e remove os blocos
const enums = [];
schema = schema.replace(/enum\s+(\w+)\s*\{([^}]*)\}\s*/g, (_, nome, corpo) => {
  const valores = corpo.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//'));
  enums.push({ nome, valores });
  return '';
});

// 4b — troca o tipo dos campos que usavam enum por String
for (const { nome } of enums) {
  const re = new RegExp(`(^\\s+\\w+\\s+)${nome}(\\??)(\\s|$)`, 'gm');
  schema = schema.replace(re, '$1String$2$3');
}

// 4c — o default de um enum vem sem aspas; como String, precisa de aspas
const todosValores = enums.flatMap((e) => e.valores);
if (todosValores.length) {
  const reDefault = new RegExp(`@default\\((${todosValores.join('|')})\\)`, 'g');
  schema = schema.replace(reDefault, '@default("$1")');
}

// 3 — remove atributos nativos do MySQL
schema = schema.replace(/\s*@db\.\w+(\([^)]*\))?/g, '');

// cabeçalho de aviso
const cabecalho = `// ============================================================
// ARQUIVO GERADO AUTOMATICAMENTE — NÃO EDITE À MÃO.
// Origem: prisma/schema.prisma
// Gerado por: node sandbox/gerarSchemaDev.js
//
// Schema de DESENVOLVIMENTO (SQLite), usado para rodar o sistema
// sem instalar MySQL. A entrega do TCC continua sendo o MySQL,
// definido em prisma/schema.prisma.
//
// Enums convertidos para String: ${enums.map((e) => e.nome).join(', ') || '(nenhum)'}
// ============================================================

`;

fs.writeFileSync(DESTINO, cabecalho + schema.trimStart() + '\n', 'utf8');

console.log('Gerado: prisma/schema.dev.prisma');
console.log('Enums convertidos para String:', enums.map((e) => e.nome).join(', ') || '(nenhum)');
