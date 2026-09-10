import type { FieldOfViewInput } from './field-of-view';
import type {
  StellariumGridLines,
  StellariumSkyLayers,
  StellariumViewState,
} from '@/features/stellarium/stellarium-service';

import SKY_CULTURES_DATA from '@/assets/stellar/skycultures-full.json';
import { isKnownLandscape } from '@/features/deep-space/landscape/landscape-catalog';
import { parseStellariumViewState } from '@/features/stellarium/stellarium-service';
import { STORAGE_KEYS } from '@/lib/storage-keys';

/** Bumped whenever the archived shape changes; older archives are ignored. */
export const VIEW_PREFERENCES_VERSION = 1;

export type ViewPreferenceEnvironment = {
  bortleIndex: number;
  cardinals: boolean;
  fog: boolean;
  turbidity: number;
};

export type ViewPreferenceGridLines = Required<StellariumGridLines>;
export type ViewPreferenceSkyLayers = Required<StellariumSkyLayers>;

/** Everything the deep-space map should look like again after reopening it. */
export type DeepSpaceViewPreferences = {
  currentCulture: string;
  environment: ViewPreferenceEnvironment;
  /** Present only while the observer keeps the field-of-view frame enabled. */
  fieldOfView?: FieldOfViewInput;
  gridLines: ViewPreferenceGridLines;
  landscapeId: string;
  nightMode: boolean;
  skyLayers: ViewPreferenceSkyLayers;
};

export type ViewPreferenceDefaults = Omit<DeepSpaceViewPreferences, 'fieldOfView'>;

type PreferenceStorage = {
  delete?: (key: string) => unknown;
  getString?: (key: string) => string | undefined;
  remove?: (key: string) => unknown;
  set: (key: string, value: string | number | boolean) => unknown;
};

const SKY_LAYER_BOOLEAN_KEYS = [
  'atmosphere',
  'constellationArt',
  'constellationBoundaries',
  'constellationLabels',
  'constellationLines',
  'constellationOnlyPointed',
  'dsoLabels',
  'landscape',
  'planetLabels',
  'satelliteLabels',
  'starLabels',
] as const;

const SKY_LAYER_HINT_KEYS = [
  'dsoHintsOffset',
  'planetHintsOffset',
  'satelliteHintsOffset',
  'starHintsOffset',
] as const;

const GRID_LINE_KEYS = [
  'azimuthal',
  'ecliptic',
  'equator',
  'equatorial_j2000',
  'equatorial_jnow',
  'meridian',
] as const;

const HINT_OFFSET_MAX = 20;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readNumberInRange(value: unknown, fallback: number, bounds: readonly [number, number]): number {
  const [min, max] = bounds;
  return isFiniteNumber(value) && value >= min && value <= max ? value : fallback;
}

function readIntegerInRange(value: unknown, fallback: number, bounds: readonly [number, number]): number {
  const [min, max] = bounds;
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max ? (value as number) : fallback;
}

function readSkyLayers(value: unknown, fallback: ViewPreferenceSkyLayers): ViewPreferenceSkyLayers {
  if (!value || typeof value !== 'object')
    return fallback;
  const record = value as Record<string, unknown>;
  const next = {} as ViewPreferenceSkyLayers;
  for (const key of SKY_LAYER_BOOLEAN_KEYS)
    next[key] = readBoolean(record[key], fallback[key]);
  for (const key of SKY_LAYER_HINT_KEYS)
    next[key] = readNumberInRange(record[key], fallback[key], [-HINT_OFFSET_MAX, HINT_OFFSET_MAX]);
  return next;
}

function readGridLines(value: unknown, fallback: ViewPreferenceGridLines): ViewPreferenceGridLines {
  if (!value || typeof value !== 'object')
    return fallback;
  const record = value as Record<string, unknown>;
  const next = {} as ViewPreferenceGridLines;
  for (const key of GRID_LINE_KEYS)
    next[key] = readBoolean(record[key], fallback[key]);
  return next;
}

function readEnvironment(value: unknown, fallback: ViewPreferenceEnvironment): ViewPreferenceEnvironment {
  if (!value || typeof value !== 'object')
    return fallback;
  const record = value as Record<string, unknown>;
  return {
    bortleIndex: readIntegerInRange(record.bortleIndex, fallback.bortleIndex, [1, 9]),
    cardinals: readBoolean(record.cardinals, fallback.cardinals),
    fog: readBoolean(record.fog, fallback.fog),
    turbidity: readNumberInRange(record.turbidity, fallback.turbidity, [0, 10]),
  };
}

function readFieldOfView(value: unknown): FieldOfViewInput | undefined {
  if (!value || typeof value !== 'object')
    return undefined;
  const { focalLengthMm, multiplier, sensorHeightMm, sensorWidthMm } = value as Record<string, unknown>;
  const positive = [focalLengthMm, multiplier, sensorHeightMm, sensorWidthMm];
  if (positive.some(field => !isFiniteNumber(field) || field <= 0))
    return undefined;
  return {
    focalLengthMm: focalLengthMm as number,
    multiplier: multiplier as number,
    sensorHeightMm: sensorHeightMm as number,
    sensorWidthMm: sensorWidthMm as number,
  };
}

function isKnownCulture(id: string): boolean {
  return SKY_CULTURES_DATA.cultures.some(culture => culture.id === id);
}

function readStringId(value: unknown, fallback: string, isKnown: (id: string) => boolean): string {
  if (typeof value !== 'string' || !/^[\w-]+$/.test(value) || !isKnown(value))
    return fallback;
  return value;
}

function readJson(store: PreferenceStorage, key: string): Record<string, unknown> | null {
  try {
    const saved = store.getString?.(key);
    if (!saved)
      return null;
    const parsed: unknown = JSON.parse(saved);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  }
  catch {
    // Damaged storage must never keep the map from opening on its defaults.
    return null;
  }
}

/**
 * Restores the archived display preferences, falling back to the page defaults
 * for anything missing, damaged or out of range. `false` and `0` are legal
 * stored values and are never treated as absent.
 */
export function readViewPreferences(store: PreferenceStorage, defaults: ViewPreferenceDefaults): DeepSpaceViewPreferences {
  const archived = readJson(store, STORAGE_KEYS.DEEP_SPACE_VIEW_PREFERENCES);
  if (!archived || archived.version !== VIEW_PREFERENCES_VERSION)
    return { ...defaults };
  return {
    currentCulture: readStringId(archived.currentCulture, defaults.currentCulture, isKnownCulture),
    environment: readEnvironment(archived.environment, defaults.environment),
    fieldOfView: readFieldOfView(archived.fieldOfView),
    gridLines: readGridLines(archived.gridLines, defaults.gridLines),
    landscapeId: readStringId(archived.landscapeId, defaults.landscapeId, isKnownLandscape),
    nightMode: readBoolean(archived.nightMode, false),
    skyLayers: readSkyLayers(archived.skyLayers, defaults.skyLayers),
  };
}

function preferencesPayload(preferences: DeepSpaceViewPreferences): Record<string, unknown> {
  return {
    currentCulture: preferences.currentCulture,
    environment: preferences.environment,
    ...(preferences.fieldOfView ? { fieldOfView: preferences.fieldOfView } : {}),
    gridLines: preferences.gridLines,
    landscapeId: preferences.landscapeId,
    nightMode: preferences.nightMode,
    skyLayers: preferences.skyLayers,
  };
}

/** Order-independent text form, so a re-ordered but equal object signs the same. */
function stableSerialize(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Stable text form of the archived values. The map compares signatures so it
 * only writes on a real change and never rewrites what it just restored.
 */
export function viewPreferencesSignature(preferences: DeepSpaceViewPreferences): string {
  return stableSerialize(preferencesPayload(preferences));
}

export function writeViewPreferences(store: PreferenceStorage, preferences: DeepSpaceViewPreferences): void {
  store.set(STORAGE_KEYS.DEEP_SPACE_VIEW_PREFERENCES, JSON.stringify({
    version: VIEW_PREFERENCES_VERSION,
    ...preferencesPayload(preferences),
  }));
}

/** Reads the camera angle archived by the last visit; illegal archives are ignored. */
export function readStoredViewState(store: PreferenceStorage): StellariumViewState | null {
  const archived = readJson(store, STORAGE_KEYS.DEEP_SPACE_VIEW_STATE);
  if (!archived || archived.version !== VIEW_PREFERENCES_VERSION)
    return null;
  return parseStellariumViewState(archived.state);
}

export function writeStoredViewState(store: PreferenceStorage, state: StellariumViewState): void {
  const parsed = parseStellariumViewState(state);
  if (!parsed)
    return;
  store.set(STORAGE_KEYS.DEEP_SPACE_VIEW_STATE, JSON.stringify({ version: VIEW_PREFERENCES_VERSION, state: parsed }));
}

function removeKey(store: PreferenceStorage, key: string) {
  if (typeof store.remove === 'function')
    store.remove(key);
  else if (typeof store.delete === 'function')
    store.delete(key);
}

/** Drops every value this feature archives, so the next visit opens on defaults. */
export function clearViewPreferences(store: PreferenceStorage): void {
  removeKey(store, STORAGE_KEYS.DEEP_SPACE_VIEW_PREFERENCES);
  removeKey(store, STORAGE_KEYS.DEEP_SPACE_VIEW_STATE);
}
