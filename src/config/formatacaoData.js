// Formatação de data e hora para as telas, sempre no fuso da loja (Dourados/MS).
//
// Antes, cada tela usava `toLocaleDateString('pt-BR')` sem fuso, o que formata
// no fuso do servidor. Num servidor em UTC (Render), um serviço registrado às
// 21h em Dourados aparecia com o dia seguinte. Aqui o fuso é explícito e não
// depende de onde o sistema roda.

const FUSO_LOJA = 'America/Campo_Grande';

const OPCOES_DATA = { timeZone: FUSO_LOJA };
const OPCOES_HORA = { timeZone: FUSO_LOJA, hour: '2-digit', minute: '2-digit' };

function comoData(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

// 19/10/2026
function dataBR(valor) {
  const d = comoData(valor);
  return d ? d.toLocaleDateString('pt-BR', OPCOES_DATA) : '—';
}

// 22:30
function horaBR(valor) {
  const d = comoData(valor);
  return d ? d.toLocaleTimeString('pt-BR', OPCOES_HORA) : '—';
}

// 19/10/2026 22:30:15
function dataHoraBR(valor) {
  const d = comoData(valor);
  return d ? d.toLocaleString('pt-BR', OPCOES_DATA) : '—';
}

// '2026-08-31' (valor de <input type="date">) → '31/08/2026'.
// É um dia de calendário, sem horário: não há fuso a aplicar. Serve para o
// período dos relatórios e da auditoria, cujas pontas nascem como "meia-noite
// do fuso do processo" e, formatadas com outro fuso, voltariam um dia.
function diaDoCalendarioBR(texto) {
  const m = String(texto || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

module.exports = { FUSO_LOJA, dataBR, horaBR, dataHoraBR, diaDoCalendarioBR };
