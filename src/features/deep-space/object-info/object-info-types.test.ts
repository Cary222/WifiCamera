import {
  formatAltPrecision,
  formatAzAlt,
  formatAzPrecision,
  formatDec,
  formatDecPrecision,
  formatDistance,
  formatDistanceStellarium,
  formatHourAngle,
  formatPhase,
  formatRa,
  formatRaPrecision,
  formatSize,
} from './object-info-types';

const INVALID_NUMBERS = [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

describe('missing and non-finite object information', () => {
  it.each(INVALID_NUMBERS)('formats invalid numeric input %s as unknown', (value) => {
    expect(formatRa(value)).toBe('--');
    expect(formatRaPrecision(value)).toBe('--');
    expect(formatDec(value)).toBe('--');
    expect(formatDecPrecision(value)).toBe('--');
    expect(formatHourAngle(value)).toBe('--');
    expect(formatAzPrecision(value)).toBe('--');
    expect(formatAltPrecision(value)).toBe('--');
    expect(formatAzAlt(value, 0)).toBe('--');
    expect(formatAzAlt(0, value)).toBe('--');
    expect(formatDistance(value)).toBe('--');
    expect(formatDistanceStellarium(value)).toBe('--');
    expect(formatPhase(value)).toBe('--');
    expect(formatSize(value)).toBe('--');
  });
});

describe('right ascension and hour angle formatting', () => {
  it('carries tenths of seconds through midnight', () => {
    expect(formatRaPrecision(23 + 59 / 60 + 59.99 / 3600)).toBe('00h  00m  00.0s');
    expect(formatHourAngle(23 + 59 / 60 + 59.99 / 3600)).toBe('00h  00m  00.0s');
    expect(formatRa(23 + 59 / 60 + 59.6 / 3600)).toBe('0h 0m 0s');
  });

  it('carries seconds into minutes and minutes into hours', () => {
    expect(formatRaPrecision(1 + 2 / 60 + 59.99 / 3600)).toBe('01h  03m  00.0s');
    expect(formatRaPrecision(1 + 59 / 60 + 59.99 / 3600)).toBe('02h  00m  00.0s');
    expect(formatRa(1 + 59 / 60 + 59.6 / 3600)).toBe('2h 0m 0s');
  });

  it.each([
    [-1, '23h  00m  00.0s'],
    [-24, '00h  00m  00.0s'],
    [24, '00h  00m  00.0s'],
    [49.5, '01h  30m  00.0s'],
    [-0, '00h  00m  00.0s'],
  ])('normalizes %s hours around the 24-hour boundary', (value, expected) => {
    expect(formatRaPrecision(value)).toBe(expected);
    expect(formatHourAngle(value)).toBe(expected);
  });
});

describe('declination and altitude formatting', () => {
  it.each([
    [0, '+00°  00\'  00.0"'],
    [-0, '-00°  00\'  00.0"'],
    [-0.000001, '-00°  00\'  00.0"'],
    [90, '+90°  00\'  00.0"'],
    [-90, '-90°  00\'  00.0"'],
    [89 + 59 / 60 + 59.99 / 3600, '+90°  00\'  00.0"'],
    [-89 - 59 / 60 - 59.99 / 3600, '-90°  00\'  00.0"'],
    [12 + 34 / 60 + 59.99 / 3600, '+12°  35\'  00.0"'],
  ])('retains the sign and carries correctly for %s degrees', (value, expected) => {
    expect(formatDecPrecision(value)).toBe(expected);
    expect(formatAltPrecision(value)).toBe(expected);
  });

  it('retains negative zero and carries whole seconds at the poles', () => {
    expect(formatDec(-0)).toBe('-0° 0\' 0"');
    expect(formatDec(89 + 59 / 60 + 59.6 / 3600)).toBe('+90° 0\' 0"');
    expect(formatDec(-89 - 59 / 60 - 59.6 / 3600)).toBe('-90° 0\' 0"');
  });

  it.each([-90.001, 90.001, 180])('rejects latitude angles outside the poles: %s', (value) => {
    expect(formatDec(value)).toBe('--');
    expect(formatDecPrecision(value)).toBe('--');
    expect(formatAltPrecision(value)).toBe('--');
    expect(formatAzAlt(0, value)).toBe('--');
  });
});

describe('azimuth formatting', () => {
  it.each([
    [359 + 59 / 60 + 59.99 / 3600, '000°  00\'  00.0"'],
    [-0.000001, '000°  00\'  00.0"'],
    [-0, '000°  00\'  00.0"'],
    [-1, '359°  00\'  00.0"'],
    [360, '000°  00\'  00.0"'],
    [721.5, '001°  30\'  00.0"'],
    [12 + 59 / 60 + 59.99 / 3600, '013°  00\'  00.0"'],
  ])('carries and wraps azimuth %s', (value, expected) => {
    expect(formatAzPrecision(value)).toBe(expected);
  });

  it('keeps zero altitude and wraps rounded decimal azimuth', () => {
    expect(formatAzAlt(0, 0)).toBe('方位 0.0° / 仰角 0.0°');
    expect(formatAzAlt(359.99, -0)).toBe('方位 0.0° / 仰角 -0.0°');
    expect(formatAzAlt(-1, -12.5)).toBe('方位 359.0° / 仰角 -12.5°');
  });
});

describe('physical property formatting', () => {
  it.each([0, -0.1])('rejects non-positive distance and size: %s', (value) => {
    expect(formatDistance(value)).toBe('--');
    expect(formatDistanceStellarium(value)).toBe('--');
    expect(formatSize(value)).toBe('--');
  });

  it('preserves valid distance formatting without changing units', () => {
    expect(formatDistanceStellarium(0.000001)).toBe('150 km');
    expect(formatDistance(0.000001)).toBe('150 km');
    expect(formatDistanceStellarium(1)).toBe('1.00 AU');
    expect(formatDistance(1)).toBe('1.00 AU');
    expect(formatDistanceStellarium(126482)).toBe('2.00 光年');
    expect(formatDistance(126482)).toBe('2.0 光年');
  });

  it.each([-0.01, 1.01])('rejects phase outside its existing fractional range: %s', (value) => {
    expect(formatPhase(value)).toBe('--');
  });

  it('preserves zero and full phase', () => {
    expect(formatPhase(0)).toBe('0.00');
    expect(formatPhase(1)).toBe('1.00');
    expect(formatPhase(0.125)).toBe('0.13');
  });

  it('carries angular size at its displayed precision', () => {
    expect(formatSize(59.999)).toBe('1\' 0.0"');
    expect(formatSize(119.99)).toBe('2\' 0.0"');
    expect(formatSize(59.96)).toBe('59.96"');
    expect(formatSize(12.345)).toBe('12.35"');
    expect(formatSize(61.25)).toBe('1\' 1.3"');
  });
});
