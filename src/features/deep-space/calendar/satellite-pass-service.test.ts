import type { SatelliteOmm, SatelliteSample, SatelliteStorage } from './satellite-pass-service';
import {
  estimateApparentMagnitude,
  loadVisualOmm,
  predictVisiblePasses,
} from './satellite-pass-service';

const NOW = new Date('2026-08-21T12:00:00.000Z');

function omm(id: number, epoch = '2026-08-20T12:00:00.000Z'): SatelliteOmm {
  return {
    ARG_OF_PERICENTER: 0,
    BSTAR: 0,
    CLASSIFICATION_TYPE: 'U',
    ECCENTRICITY: 0.001,
    ELEMENT_SET_NO: 999,
    EPHEMERIS_TYPE: 0,
    EPOCH: epoch,
    INCLINATION: 51.6,
    MEAN_ANOMALY: 0,
    MEAN_MOTION: 15.5,
    MEAN_MOTION_DDOT: 0,
    MEAN_MOTION_DOT: 0,
    NORAD_CAT_ID: id,
    OBJECT_ID: `2026-00${id}A`,
    OBJECT_NAME: `SAT ${id}`,
    RA_OF_ASC_NODE: 0,
    REV_AT_EPOCH: 1,
  };
}

function memoryStorage(initial: Record<string, string> = {}): SatelliteStorage & { values: Record<string, string> } {
  const values = { ...initial };
  return {
    getString: key => values[key],
    set: (key, value) => {
      values[key] = value;
    },
    values,
  };
}

describe('satellite OMM loading', () => {
  it('uses a six-hour fresh cache without requesting the network', async () => {
    const records = [omm(1)];
    const storage = memoryStorage({
      SATELLITE_VISUAL_FETCHED_AT: `${NOW.getTime() - 5 * 3_600_000}`,
      SATELLITE_VISUAL_OMM: JSON.stringify(records),
    });
    const fetcher = jest.fn();

    await expect(loadVisualOmm({ fetcher, now: NOW, storage })).resolves.toEqual(records);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fetches stale data, filters malformed rows and updates the cache', async () => {
    const storage = memoryStorage();
    const fetcher = jest.fn(async () => ({
      json: async () => [omm(7), { OBJECT_NAME: 'broken' }],
      ok: true,
    }));

    await expect(loadVisualOmm({ fetcher, now: NOW, storage })).resolves.toEqual([omm(7)]);
    expect(JSON.parse(storage.values.SATELLITE_VISUAL_OMM)).toEqual([omm(7)]);
    expect(storage.values.SATELLITE_VISUAL_FETCHED_AT).toBe(`${NOW.getTime()}`);
  });

  it('falls back to a cache no older than seven days when the network fails', async () => {
    const records = [omm(2)];
    const storage = memoryStorage({
      SATELLITE_VISUAL_FETCHED_AT: `${NOW.getTime() - 3 * 86_400_000}`,
      SATELLITE_VISUAL_OMM: JSON.stringify(records),
    });
    const fetcher = jest.fn(async () => {
      throw new Error('offline');
    });

    await expect(loadVisualOmm({ fetcher, now: NOW, storage })).resolves.toEqual(records);
  });

  it('rejects a cache older than seven days after a network failure', async () => {
    const storage = memoryStorage({
      SATELLITE_VISUAL_FETCHED_AT: `${NOW.getTime() - 8 * 86_400_000}`,
      SATELLITE_VISUAL_OMM: JSON.stringify([omm(3)]),
    });

    await expect(loadVisualOmm({
      fetcher: async () => { throw new Error('offline'); },
      now: NOW,
      storage,
    })).rejects.toThrow('offline');
  });
});

describe('visible satellite pass prediction', () => {
  it('scales standard magnitude by observer range', () => {
    expect(estimateApparentMagnitude(4, 420, 0)).toBeCloseTo(2.12, 2);
    expect(estimateApparentMagnitude(4, 1_000, 0)).toBeCloseTo(4, 5);
  });

  it('keeps only bright, sunlit, high passes with known photometry and sorts them', async () => {
    const start = new Date('2026-08-21T12:00:00.000Z');
    const end = new Date('2026-08-21T12:10:00.000Z');
    const sample = (record: SatelliteOmm, date: Date): SatelliteSample | null => {
      const minute = (date.getTime() - start.getTime()) / 60_000;
      if (record.NORAD_CAT_ID === 1) {
        return { elevationDeg: 50 - Math.abs(minute - 6) * 10, rangeKm: 500, shadowFraction: 0 };
      }
      if (record.NORAD_CAT_ID === 2) {
        return { elevationDeg: 8 - Math.abs(minute - 3), rangeKm: 500, shadowFraction: 0 };
      }
      if (record.NORAD_CAT_ID === 3) {
        return { elevationDeg: 60 - Math.abs(minute - 2) * 10, rangeKm: 500, shadowFraction: 1 };
      }
      return { elevationDeg: 70, rangeKm: 500, shadowFraction: 0 };
    };

    const passes = await predictVisiblePasses({
      end,
      observer: { latitudeDeg: 39.9, longitudeDeg: 116.41 },
      photometry: {
        1: { name: 'Bright One', standardMagnitude: 4 },
        2: { name: 'Too Low', standardMagnitude: 3 },
        3: { name: 'In Shadow', standardMagnitude: 3 },
      },
      records: [omm(1), omm(2), omm(3), omm(4)],
      sample,
      start,
      stepSeconds: 60,
    });

    expect(passes).toEqual([
      {
        magnitude: 2.5,
        maxElevationDeg: 50,
        name: 'Bright One',
        noradId: 1,
        peakTime: '2026-08-21T12:06:00.000Z',
      },
    ]);
  });

  it('drops OMM records whose epoch is more than seven days from the query date', async () => {
    const sample = jest.fn(() => ({ elevationDeg: 80, rangeKm: 400, shadowFraction: 0 }));

    await expect(predictVisiblePasses({
      end: new Date('2026-08-21T13:00:00.000Z'),
      observer: { latitudeDeg: 0, longitudeDeg: 0 },
      photometry: { 8: { name: 'Old', standardMagnitude: 1 } },
      records: [omm(8, '2026-08-10T12:00:00.000Z')],
      sample,
      start: NOW,
    })).resolves.toEqual([]);
    expect(sample).not.toHaveBeenCalled();
  });
});
