// Fuso da loja (Dourados/MS). As regras que usam "meia-noite" e "fim do dia"
// (garantia, vencimento, períodos dos relatórios) seguem o fuso do processo;
// sem isto, num servidor em UTC elas virariam às 20h de Dourados. Tem de ser
// definido antes de qualquer data ser criada.
process.env.TZ = process.env.TZ || 'America/Campo_Grande';

const app = require('./src/app');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});