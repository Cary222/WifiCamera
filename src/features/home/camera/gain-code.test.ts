import { formatGainDb, formatGainDbNumber, gainCodeToDb } from './gain-code';

describe('gain-code', () => {
  it('maps analogue-gain code to real dB (0.3 dB/step)', () => {
    expect(gainCodeToDb(0)).toBe(0);
    expect(gainCodeToDb(21)).toBe(6.3);
    expect(gainCodeToDb(30)).toBe(9);
  });

  it('formats UI labels without claiming the code is dB', () => {
    expect(formatGainDb(0)).toBe('0 dB');
    expect(formatGainDb(24)).toBe('7.2 dB');
    expect(formatGainDb(30)).toBe('9 dB');
    expect(formatGainDbNumber(15)).toBe('4.5');
  });
});
