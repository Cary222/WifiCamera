import { clampGain, formatGain, formatGainDb, formatGainDbNumber, GAIN_MAX, GAIN_MIN } from './gain-code';

describe('gain-code (unified Gain 0~100)', () => {
  it('clamps gain to integer 0~100 range', () => {
    expect(clampGain(-5)).toBe(GAIN_MIN);
    expect(clampGain(0)).toBe(0);
    expect(clampGain(25.4)).toBe(25);
    expect(clampGain(50)).toBe(50);
    expect(clampGain(120)).toBe(GAIN_MAX);
  });

  it('formats UI labels unitless without dB or percent suffix', () => {
    expect(formatGain(0)).toBe('0');
    expect(formatGain(25)).toBe('25');
    expect(formatGain(100)).toBe('100');
    expect(formatGainDb(50)).toBe('50');
    expect(formatGainDbNumber(50)).toBe('50');
  });
});
