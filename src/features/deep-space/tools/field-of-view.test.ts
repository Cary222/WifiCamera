import { calculateFieldOfView, createFrameLayout, formatAngularSize, getMapVerticalFov } from './field-of-view';

describe('field-of-view calculations', () => {
  it('calculates a full-frame 500 mm optical field', () => {
    expect(calculateFieldOfView({ focalLengthMm: 500, multiplier: 1, sensorHeightMm: 24, sensorWidthMm: 36 })).toMatchObject({
      diagonalDeg: expect.closeTo(4.95, 2),
      horizontalDeg: expect.closeTo(4.12, 2),
      verticalDeg: expect.closeTo(2.75, 2),
    });
  });

  it('uses the optical multiplier in the effective focal length', () => {
    expect(calculateFieldOfView({ focalLengthMm: 500, multiplier: 2, sensorHeightMm: 24, sensorWidthMm: 36 })).toMatchObject({
      effectiveFocalLengthMm: 1000,
      horizontalDeg: expect.closeTo(2.06, 2),
    });
  });

  it('rejects non-positive optical dimensions', () => {
    expect(calculateFieldOfView({ focalLengthMm: 0, multiplier: 1, sensorHeightMm: 24, sensorWidthMm: 36 })).toBeNull();
    expect(calculateFieldOfView({ focalLengthMm: 500, multiplier: -1, sensorHeightMm: 24, sensorWidthMm: 36 })).toBeNull();
    expect(calculateFieldOfView({ focalLengthMm: 500, multiplier: 1, sensorHeightMm: 0, sensorWidthMm: 36 })).toBeNull();
  });

  it('formats narrow fields in arcminutes', () => {
    expect(formatAngularSize(0.5)).toBe('30.0′');
    expect(formatAngularSize(1.25)).toBe('1.25°');
  });

  it('fits a landscape camera frame within a portrait viewport without changing its aspect ratio', () => {
    const frame = createFrameLayout({ height: 2400, width: 1080 }, { heightMm: 24, widthMm: 36 });

    expect(frame.width / frame.height).toBeCloseTo(1.5, 5);
    expect(frame.x).toBeGreaterThanOrEqual(0);
    expect(frame.y).toBeGreaterThanOrEqual(0);
    expect(frame.x + frame.width).toBeLessThanOrEqual(1080);
    expect(frame.y + frame.height).toBeLessThanOrEqual(2400);
  });

  it('expands the map vertical field so the overlay frame represents the computed sensor field', () => {
    const frame = createFrameLayout({ height: 2400, width: 1080 }, { heightMm: 24, widthMm: 36 });

    expect(getMapVerticalFov(2.75, frame, 2400)).toBeCloseTo(11.2, 1);
  });
});
