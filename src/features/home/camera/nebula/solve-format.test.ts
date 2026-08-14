import {
  formatDecCoordinate,
  formatRaCoordinate,
  formatSolveElapsed,
} from './solve-format';

describe('plate solve formatting', () => {
  it('formats right ascension in degrees and HMS', () => {
    expect(formatRaCoordinate(180)).toBe('180.00000° / 12h 00m 00.0s');
  });

  it('wraps right ascension into the 0–360 degree range', () => {
    expect(formatRaCoordinate(-15)).toBe('345.00000° / 23h 00m 00.0s');
  });

  it('formats signed declination in degrees and DMS', () => {
    expect(formatDecCoordinate(-12.5)).toBe('-12.50000° / −12° 30′ 00.0″');
  });

  it('formats solve duration in milliseconds or seconds', () => {
    expect(formatSolveElapsed(812)).toBe('812 ms');
    expect(formatSolveElapsed(12_345)).toBe('12.35 秒');
  });
});
