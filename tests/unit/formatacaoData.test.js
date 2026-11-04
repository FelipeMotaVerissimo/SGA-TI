const { FUSO_LOJA, dataBR, horaBR, dataHoraBR, diaDoCalendarioBR } =require('../../src/config/formatacaoData');

// A suíte roda em UTC (tests/globalSetup.js): é onde a formatação sem fuso erra.
const MADRUGADA_UTC = new Date('2027-03-01T02:30:15Z'); // 28/02/2027 22:30:15 em Dourados

describe('formatacaoData — fuso da loja', () => {
  test('o fuso é o de Dourados', () => {
    expect(FUSO_LOJA).toBe('America/Campo_Grande');
  });

  test('dataBR usa o dia de Dourados, não o de UTC', () => {
    expect(dataBR(MADRUGADA_UTC)).toBe('28/02/2027');
  });

  test('horaBR usa a hora de Dourados', () => {
    expect(horaBR(MADRUGADA_UTC)).toBe('22:30');
  });

  test('dataHoraBR junta data e hora de Dourados', () => {
    expect(dataHoraBR(MADRUGADA_UTC)).toBe('28/02/2027, 22:30:15');
  });

  test('aceita texto ISO, como vem de um JSON', () => {
    expect(dataBR('2027-03-01T02:30:15.000Z')).toBe('28/02/2027');
  });

  test('meio-dia não muda de dia', () => {
    expect(dataBR(new Date('2027-03-01T15:00:00Z'))).toBe('01/03/2027');
  });

  test('diaDoCalendarioBR só reordena o dia, sem fuso', () => {
    expect(diaDoCalendarioBR('2026-08-01')).toBe('01/08/2026');
    expect(diaDoCalendarioBR('2027-03-01')).toBe('01/03/2027');
    expect(diaDoCalendarioBR(null)).toBe('—');
    expect(diaDoCalendarioBR('lixo')).toBe('—');
  });

  test('vazio ou inválido vira traço, e não 31/12/1969', () => {
    for (const v of [null, undefined, '', 'lixo']) {
      expect(dataBR(v)).toBe('—');
      expect(horaBR(v)).toBe('—');
      expect(dataHoraBR(v)).toBe('—');
    }
  });
});
