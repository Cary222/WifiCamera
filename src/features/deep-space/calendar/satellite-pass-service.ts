import {
  degreesToRadians,
  ecfToLookAngles,
  eciToEcf,
  gstime,
  jday,
  json2satrec,
  propagate,
  sunPos,
} from 'satellite.js';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const FRESH_CACHE_MS = 6 * HOUR_MS;
const MAX_CACHE_MS = 7 * DAY_MS;
const MAX_OMM_AGE_MS = 7 * DAY_MS;
const DEFAULT_STEP_SECONDS = 60;
const REFINE_STEP_SECONDS = 5;
const MIN_ELEVATION_DEG = 10;
const MAX_VISIBLE_MAGNITUDE = 6.5;
const MAX_SHADOW_FRACTION = 0.95;
const MAX_PASSES = 30;
const EARTH_RADIUS_KM = 6_378.137;
const SUN_RADIUS_KM = 695_700;
const KM_PER_AU = 149_597_870.69098932;

type Vector3 = { x: number; y: number; z: number };

function vectorLength(value: Vector3): number {
  return Math.sqrt(value.x ** 2 + value.y ** 2 + value.z ** 2);
}

function shadowObscuredFraction(sunAu: Vector3 | number[], satelliteKm: Vector3): number {
  const sunVector = Array.isArray(sunAu) ? { x: sunAu[0], y: sunAu[1], z: sunAu[2] } : sunAu;
  const sunKm = { x: sunVector.x * KM_PER_AU, y: sunVector.y * KM_PER_AU, z: sunVector.z * KM_PER_AU };
  const sunLength = vectorLength(sunKm);
  const satelliteLength = vectorLength(satelliteKm);
  const antisolar = { x: -sunKm.x / sunLength, y: -sunKm.y / sunLength, z: -sunKm.z / sunLength };
  const projection = satelliteKm.x * antisolar.x + satelliteKm.y * antisolar.y + satelliteKm.z * antisolar.z;
  if (projection <= 0)
    return 0;

  const earthRadius = Math.asin(EARTH_RADIUS_KM / satelliteLength);
  const sunRadius = Math.asin(SUN_RADIUS_KM / sunLength);
  const separation = Math.acos(Math.max(-1, Math.min(1, projection / satelliteLength)));
  if (separation <= earthRadius - sunRadius)
    return 1;
  if (separation >= earthRadius + sunRadius)
    return 0;

  const sunArea = sunRadius ** 2 * Math.acos((separation ** 2 + sunRadius ** 2 - earthRadius ** 2) / (2 * separation * sunRadius));
  const earthArea = earthRadius ** 2 * Math.acos((separation ** 2 + earthRadius ** 2 - sunRadius ** 2) / (2 * separation * earthRadius));
  const overlapChord = 0.5 * Math.sqrt(
    (-separation + sunRadius + earthRadius)
    * (separation + sunRadius - earthRadius)
    * (separation - sunRadius + earthRadius)
    * (separation + sunRadius + earthRadius),
  );
  return (sunArea + earthArea - overlapChord) / (Math.PI * sunRadius ** 2);
}

export const SATELLITE_VISUAL_ENDPOINT = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json';
export const SATELLITE_OMM_CACHE_KEY = 'SATELLITE_VISUAL_OMM';
export const SATELLITE_FETCHED_AT_KEY = 'SATELLITE_VISUAL_FETCHED_AT';

export type SatelliteOmm = {
  ARG_OF_PERICENTER: number;
  BSTAR: number;
  CLASSIFICATION_TYPE: 'C' | 'U';
  ECCENTRICITY: number;
  ELEMENT_SET_NO: number;
  EPHEMERIS_TYPE: 0;
  EPOCH: string;
  INCLINATION: number;
  MEAN_ANOMALY: number;
  MEAN_MOTION: number;
  MEAN_MOTION_DDOT: number;
  MEAN_MOTION_DOT: number;
  NORAD_CAT_ID: number;
  OBJECT_ID: string;
  OBJECT_NAME: string;
  RA_OF_ASC_NODE: number;
  REV_AT_EPOCH: number;
};

export type SatellitePhotometry = Record<number, { name: string; standardMagnitude: number }>;

export type SatellitePass = {
  magnitude: number;
  maxElevationDeg: number;
  name: string;
  noradId: number;
  peakTime: string;
};

export type SatelliteSample = {
  elevationDeg: number;
  rangeKm: number;
  shadowFraction: number;
};

export type SatelliteStorage = {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
};

type FetchResponse = { json: () => Promise<unknown>; ok: boolean };
type SatelliteFetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<FetchResponse>;

type LoadVisualOmmOptions = {
  fetcher?: SatelliteFetcher;
  now?: Date;
  storage: SatelliteStorage;
};

type ObserverLocation = { latitudeDeg: number; longitudeDeg: number };

type PredictOptions = {
  end: Date;
  observer: ObserverLocation;
  photometry: SatellitePhotometry;
  records: SatelliteOmm[];
  sample?: (record: SatelliteOmm, date: Date, observer: ObserverLocation) => SatelliteSample | null;
  start: Date;
  stepSeconds?: number;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isSatelliteOmm(value: unknown): value is SatelliteOmm {
  if (!value || typeof value !== 'object')
    return false;
  const row = value as Record<string, unknown>;
  return typeof row.OBJECT_NAME === 'string'
    && typeof row.OBJECT_ID === 'string'
    && typeof row.EPOCH === 'string'
    && typeof row.CLASSIFICATION_TYPE === 'string'
    && isFiniteNumber(row.NORAD_CAT_ID)
    && isFiniteNumber(row.MEAN_MOTION)
    && isFiniteNumber(row.ECCENTRICITY)
    && isFiniteNumber(row.INCLINATION)
    && isFiniteNumber(row.RA_OF_ASC_NODE)
    && isFiniteNumber(row.ARG_OF_PERICENTER)
    && isFiniteNumber(row.MEAN_ANOMALY)
    && row.EPHEMERIS_TYPE === 0
    && isFiniteNumber(row.ELEMENT_SET_NO)
    && isFiniteNumber(row.REV_AT_EPOCH)
    && isFiniteNumber(row.BSTAR)
    && isFiniteNumber(row.MEAN_MOTION_DOT)
    && isFiniteNumber(row.MEAN_MOTION_DDOT)
    && Number.isFinite(Date.parse(row.EPOCH));
}

function readCache(storage: SatelliteStorage): { fetchedAt: number; records: SatelliteOmm[] } | null {
  const raw = storage.getString(SATELLITE_OMM_CACHE_KEY);
  const fetchedAt = Number(storage.getString(SATELLITE_FETCHED_AT_KEY));
  if (!raw || !Number.isFinite(fetchedAt))
    return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed))
      return null;
    return { fetchedAt, records: parsed.filter(isSatelliteOmm) };
  }
  catch {
    return null;
  }
}

export async function loadVisualOmm(options: LoadVisualOmmOptions): Promise<SatelliteOmm[]> {
  const { storage } = options;
  const now = options.now ?? new Date();
  const fetcher = options.fetcher ?? (fetch as unknown as SatelliteFetcher);
  const cache = readCache(storage);
  const cacheAge = cache ? now.getTime() - cache.fetchedAt : Number.POSITIVE_INFINITY;
  if (cache && cacheAge >= 0 && cacheAge <= FRESH_CACHE_MS)
    return cache.records;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(SATELLITE_VISUAL_ENDPOINT, { signal: controller.signal });
    if (!response.ok)
      throw new Error('Unable to fetch satellite orbital data.');
    const payload = await response.json();
    if (!Array.isArray(payload))
      throw new Error('Satellite orbital response is malformed.');
    const records = payload.filter(isSatelliteOmm);
    storage.set(SATELLITE_OMM_CACHE_KEY, JSON.stringify(records));
    storage.set(SATELLITE_FETCHED_AT_KEY, `${now.getTime()}`);
    return records;
  }
  catch (error) {
    if (cache && cacheAge >= 0 && cacheAge <= MAX_CACHE_MS)
      return cache.records;
    throw error;
  }
  finally {
    clearTimeout(timer);
  }
}

/** Standard magnitude is defined at 1000 km; range and penumbra reduce apparent brightness. */
export function estimateApparentMagnitude(standardMagnitude: number, rangeKm: number, obscuredFraction: number): number {
  if (!isFiniteNumber(standardMagnitude) || !isFiniteNumber(rangeKm) || rangeKm <= 0)
    return Number.POSITIVE_INFINITY;
  const visibleFraction = Math.max(0, Math.min(1, 1 - obscuredFraction));
  if (visibleFraction <= 0.05)
    return Number.POSITIVE_INFINITY;
  return standardMagnitude + 5 * Math.log10(rangeKm / 1_000) - 2.5 * Math.log10(visibleFraction);
}

function sampleWithSgp4(record: SatelliteOmm, date: Date, observer: ObserverLocation): SatelliteSample | null {
  const satrec = json2satrec(record);
  const state = propagate(satrec, date);
  if (!state)
    return null;
  const gmst = gstime(date);
  const positionEcf = eciToEcf(state.position, gmst);
  const look = ecfToLookAngles({
    height: 0,
    latitude: degreesToRadians(observer.latitudeDeg),
    longitude: degreesToRadians(observer.longitudeDeg),
  }, positionEcf);
  return {
    elevationDeg: look.elevation * 180 / Math.PI,
    rangeKm: look.rangeSat,
    shadowFraction: shadowObscuredFraction(sunPos(jday(date)).rsun, state.position),
  };
}

function isFreshForQuery(record: SatelliteOmm, queryStart: Date): boolean {
  const epoch = Date.parse(record.EPOCH);
  return Number.isFinite(epoch) && Math.abs(queryStart.getTime() - epoch) <= MAX_OMM_AGE_MS;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function refinePeak({
  coarsePeak,
  observer,
  radiusSeconds,
  record,
  sample,
}: {
  coarsePeak: Date;
  observer: ObserverLocation;
  radiusSeconds: number;
  record: SatelliteOmm;
  sample: NonNullable<PredictOptions['sample']>;
}): { date: Date; sample: SatelliteSample } | null {
  let best: { date: Date; sample: SatelliteSample } | null = null;
  for (let offset = -radiusSeconds; offset <= radiusSeconds; offset += REFINE_STEP_SECONDS) {
    const date = new Date(coarsePeak.getTime() + offset * 1_000);
    const value = sample(record, date, observer);
    if (value && (!best || value.elevationDeg > best.sample.elevationDeg))
      best = { date, sample: value };
  }
  return best;
}

export async function predictVisiblePasses(options: PredictOptions): Promise<SatellitePass[]> {
  const { end, observer, photometry, records, start } = options;
  if (end <= start)
    return [];
  const sample = options.sample ?? sampleWithSgp4;
  const stepSeconds = options.stepSeconds ?? DEFAULT_STEP_SECONDS;
  const stepMs = stepSeconds * 1_000;
  const passes: SatellitePass[] = [];

  for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
    const record = records[recordIndex];
    const appearance = photometry[record.NORAD_CAT_ID];
    if (!appearance || !isFreshForQuery(record, start))
      continue;

    let inPass = false;
    let coarsePeak: { date: Date; sample: SatelliteSample } | null = null;
    for (let time = start.getTime(); time <= end.getTime(); time += stepMs) {
      const date = new Date(time);
      const value = sample(record, date, observer);
      const aboveHorizon = Boolean(value && value.elevationDeg > 0);
      if (aboveHorizon && value) {
        inPass = true;
        if (!coarsePeak || value.elevationDeg > coarsePeak.sample.elevationDeg)
          coarsePeak = { date, sample: value };
      }
      const atWindowEnd = time + stepMs > end.getTime();
      if (inPass && (!aboveHorizon || atWindowEnd)) {
        if (coarsePeak) {
          const refined = refinePeak({
            coarsePeak: coarsePeak.date,
            observer,
            radiusSeconds: stepSeconds,
            record,
            sample,
          });
          if (refined && refined.sample.elevationDeg >= MIN_ELEVATION_DEG && refined.sample.shadowFraction < MAX_SHADOW_FRACTION) {
            const magnitude = estimateApparentMagnitude(
              appearance.standardMagnitude,
              refined.sample.rangeKm,
              refined.sample.shadowFraction,
            );
            if (magnitude <= MAX_VISIBLE_MAGNITUDE) {
              passes.push({
                magnitude: roundOne(magnitude),
                maxElevationDeg: Math.round(refined.sample.elevationDeg),
                name: appearance.name || record.OBJECT_NAME,
                noradId: record.NORAD_CAT_ID,
                peakTime: refined.date.toISOString(),
              });
            }
          }
        }
        inPass = false;
        coarsePeak = null;
      }
    }
    if (recordIndex % 12 === 11)
      await Promise.resolve();
  }

  return passes
    .sort((a, b) => Date.parse(a.peakTime) - Date.parse(b.peakTime))
    .slice(0, MAX_PASSES);
}
