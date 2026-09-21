/**
 * Regression guard for the shutter ruler shared by 风景模式 (landscape) and
 * 星空模式 (nebula): both modes must be able to select, display and send long
 * exposures up to 60s, while keeping the existing short stops untouched.
 *
 * Both camera screens import this series, so the two modes cannot drift apart.
 */
import { formatShutter, SHUTTER_VALUES } from './shutter-values';

describe('camera shutter range (风景模式 + 星空模式)', () => {
  it('offers a 60s long exposure as its top stop', () => {
    expect(SHUTTER_VALUES).toContain(60);
    expect(Math.max(...SHUTTER_VALUES)).toBe(60);
  });

  it('displays the 60s stop as "60"', () => {
    expect(formatShutter(60)).toBe('60');
  });

  it('keeps the existing short stops and the 1s stop', () => {
    expect(SHUTTER_VALUES.slice(0, 6)).toEqual([0.001, 0.00125, 0.0016, 0.002, 0.0025, 0.0033]);
    expect(SHUTTER_VALUES).toContain(0.5);
    expect(SHUTTER_VALUES).toContain(1);
    expect(formatShutter(1)).toBe('1');
    expect(formatShutter(0.5)).toBe('1/2');
    expect(formatShutter(0.001)).toBe('1/1000');
  });

  it('keeps every long exposure above 1s increasing up to the 60s ceiling', () => {
    const longExposures = SHUTTER_VALUES.filter(value => value > 1);

    expect(longExposures).toEqual([1.5, 2, 3, 4, 5, 6, 8, 10, 13, 15, 20, 25, 30, 40, 50, 60]);
  });

  it('has strictly increasing stops without duplicates', () => {
    expect(new Set(SHUTTER_VALUES).size).toBe(SHUTTER_VALUES.length);
    for (let index = 1; index < SHUTTER_VALUES.length; index += 1)
      expect(SHUTTER_VALUES[index]).toBeGreaterThan(SHUTTER_VALUES[index - 1]);
  });
});
