import { resolveCompassHeading } from './compass-heading';

describe('resolveCompassHeading', () => {
  it('prefers the true heading from the location provider', () => {
    expect(resolveCompassHeading({ magHeading: 24, trueHeading: 123.4 })).toBe(123.4);
  });

  it('falls back to magnetic heading when true north is unavailable', () => {
    expect(resolveCompassHeading({ magHeading: 358.2, trueHeading: -1 })).toBe(358.2);
  });

  it('normalizes a full rotation to zero degrees', () => {
    expect(resolveCompassHeading({ magHeading: 360, trueHeading: 0 })).toBe(0);
  });
});
