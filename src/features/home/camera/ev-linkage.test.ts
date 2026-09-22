import { calculateEvLinkedExposure } from './ev-linkage';

describe('calculateEvLinkedExposure', () => {
  it('returns base values when EV is 0', () => {
    const result = calculateEvLinkedExposure(0.008, 10, 0);
    expect(result.exposure).toBe(0.008);
    expect(result.gain).toBe(10);
    expect(result.formattedExposure).toBe('1/125');
    expect(result.formattedGain).toBe('10');
    expect(result.factor).toBe(1);
  });

  it('doubles exposure time when EV is +1.0', () => {
    // 0.008s (1/125) * 2 = 0.016s -> closest stop is 0.0167s (1/60)
    const result = calculateEvLinkedExposure(0.008, 10, 1.0);
    expect(result.exposure).toBe(0.0167);
    expect(result.formattedExposure).toBe('1/60');
    expect(result.gain).toBe(10);
    expect(result.factor).toBe(2);
  });

  it('quadruples exposure time when EV is +2.0', () => {
    // 0.008s * 4 = 0.032s -> closest stop is 0.033s (1/30)
    const result = calculateEvLinkedExposure(0.008, 10, 2.0);
    expect(result.exposure).toBe(0.033);
    expect(result.formattedExposure).toBe('1/30');
    expect(result.gain).toBe(10);
    expect(result.factor).toBe(4);
  });

  it('halves exposure time when EV is -1.0', () => {
    // 0.008s / 2 = 0.004s (1/250)
    const result = calculateEvLinkedExposure(0.008, 10, -1.0);
    expect(result.exposure).toBe(0.004);
    expect(result.formattedExposure).toBe('1/250');
    expect(result.gain).toBe(10);
    expect(result.factor).toBe(0.5);
  });

  it('reduces exposure time to 1/4 when EV is -2.0', () => {
    // 0.008s / 4 = 0.002s (1/500)
    const result = calculateEvLinkedExposure(0.008, 10, -2.0);
    expect(result.exposure).toBe(0.002);
    expect(result.formattedExposure).toBe('1/500');
    expect(result.gain).toBe(10);
    expect(result.factor).toBe(0.25);
  });

  it('compensates via gain when target exposure exceeds max shutter limit', () => {
    // At max shutter 60s, EV +2.0 -> target 240s -> gain compensates
    const result = calculateEvLinkedExposure(60, 20, 2.0);
    expect(result.exposure).toBe(60);
    expect(result.gain).toBeGreaterThan(20);
    expect(result.gain).toBeLessThanOrEqual(100);
  });

  it('handles negative boundaries gracefully', () => {
    // At min shutter 0.001s, EV -3.0 -> target 0.000125s -> gain compensates downward
    const result = calculateEvLinkedExposure(0.001, 30, -3.0);
    expect(result.exposure).toBe(0.001);
    expect(result.gain).toBeLessThan(30);
    expect(result.gain).toBeGreaterThanOrEqual(0);
  });
});
