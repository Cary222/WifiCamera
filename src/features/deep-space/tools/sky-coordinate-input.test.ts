import { parseSkyCoordinateInput } from './sky-coordinate-input';

describe('parseSkyCoordinateInput', () => {
  it('parses Stellarium-style RA and Dec input', () => {
    const result = parseSkyCoordinateInput('6h45m7s 16d43m29s');

    expect(result?.raHours).toBeCloseTo(6.751944444444445, 10);
    expect(result?.decDeg).toBeCloseTo(16.724722222222223, 10);
  });

  it('parses signed declination with degree symbols', () => {
    const result = parseSkyCoordinateInput('05h 55m 10.3s -07° 24\' 25"');

    expect(result?.raHours).toBeCloseTo(5.919527777777778, 10);
    expect(result?.decDeg).toBeCloseTo(-7.406944444444445, 10);
  });

  it('supports decimal degrees and the abbreviated coordinate format', () => {
    expect(parseSkyCoordinateInput('83.82, -5.39')).toEqual({ raHours: 83.82 / 15, decDeg: -5.39 });
    expect(parseSkyCoordinateInput('05h 35m, -05° 23\'')).toEqual({ raHours: 5 + 35 / 60, decDeg: -(5 + 23 / 60) });
    expect(parseSkyCoordinateInput('８３.８２， −５.３９')).toEqual({ raHours: 83.82 / 15, decDeg: -5.39 });
  });

  it('preserves a minus sign on zero degrees', () => {
    expect(parseSkyCoordinateInput('0h0m0s -00d30m0s')?.decDeg).toBe(-0.5);
  });

  it.each(['361, 0', '-1, 0', '30, 91', 'NaN, 0', '30, Infinity', '23h60m, 00d00m', '1h0m, -90d1m', 'M31', 'HIP 32349', '83.82'])('rejects invalid or non-coordinate input %s', (input) => {
    expect(parseSkyCoordinateInput(input)).toBeNull();
  });

  it('rejects incomplete or out-of-range coordinates', () => {
    expect(parseSkyCoordinateInput('6h45m')).toBeNull();
    expect(parseSkyCoordinateInput('25h0m0s 10d0m0s')).toBeNull();
    expect(parseSkyCoordinateInput('6h0m0s -91d0m0s')).toBeNull();
  });
});
