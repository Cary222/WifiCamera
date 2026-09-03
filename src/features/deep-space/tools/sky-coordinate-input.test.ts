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

  it('rejects incomplete or out-of-range coordinates', () => {
    expect(parseSkyCoordinateInput('6h45m')).toBeNull();
    expect(parseSkyCoordinateInput('25h0m0s 10d0m0s')).toBeNull();
    expect(parseSkyCoordinateInput('6h0m0s -91d0m0s')).toBeNull();
  });
});
