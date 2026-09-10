import type { DeepSpaceViewPreferences, ViewPreferenceDefaults } from './deep-space-view-preferences';

import { STORAGE_KEYS } from '@/lib/storage-keys';
import {
  clearViewPreferences,
  readStoredViewState,
  readViewPreferences,
  VIEW_PREFERENCES_VERSION,
  viewPreferencesSignature,
  writeStoredViewState,
  writeViewPreferences,
} from './deep-space-view-preferences';

const DEFAULTS: ViewPreferenceDefaults = {
  currentCulture: 'western',
  environment: { bortleIndex: 1, cardinals: true, fog: true, turbidity: 0.96 },
  gridLines: {
    azimuthal: false,
    ecliptic: false,
    equator: false,
    equatorial_j2000: false,
    equatorial_jnow: false,
    meridian: false,
  },
  landscapeId: 'guereins',
  nightMode: false,
  skyLayers: {
    atmosphere: true,
    constellationArt: true,
    constellationBoundaries: false,
    constellationLabels: true,
    constellationLines: true,
    constellationOnlyPointed: false,
    dsoHintsOffset: 0,
    dsoLabels: true,
    landscape: true,
    planetHintsOffset: 0,
    planetLabels: true,
    satelliteHintsOffset: 0,
    satelliteLabels: true,
    starHintsOffset: 0,
    starLabels: true,
  },
};

function createMemoryStorage() {
  const map = new Map<string, string | number | boolean>();
  return {
    __map: map,
    delete: jest.fn((key: string) => map.delete(key)),
    getString: jest.fn((key: string) => (typeof map.get(key) === 'string' ? (map.get(key) as string) : undefined)),
    set: jest.fn((key: string, value: string | number | boolean) => map.set(key, value)),
  };
}

const FULL_ARCHIVE: DeepSpaceViewPreferences = {
  currentCulture: 'chinese',
  environment: { bortleIndex: 9, cardinals: false, fog: false, turbidity: 0 },
  gridLines: {
    azimuthal: true,
    ecliptic: false,
    equator: true,
    equatorial_j2000: false,
    equatorial_jnow: true,
    meridian: false,
  },
  landscapeId: 'ocean',
  nightMode: false,
  skyLayers: {
    atmosphere: false,
    constellationArt: false,
    constellationBoundaries: true,
    constellationLabels: false,
    constellationLines: false,
    constellationOnlyPointed: true,
    dsoHintsOffset: -20,
    dsoLabels: false,
    landscape: false,
    planetHintsOffset: -1.5,
    planetLabels: false,
    satelliteHintsOffset: 20,
    satelliteLabels: false,
    starHintsOffset: 0,
    starLabels: false,
  },
};

describe('deep-space view preferences', () => {
  it('returns the page defaults when nothing is archived', () => {
    const store = createMemoryStorage();

    expect(readViewPreferences(store, DEFAULTS)).toEqual(DEFAULTS);
  });

  it('round-trips every switch and slider, treating false and 0 as real values', () => {
    const store = createMemoryStorage();

    writeViewPreferences(store, FULL_ARCHIVE);

    expect(readViewPreferences(store, DEFAULTS)).toEqual(FULL_ARCHIVE);
  });

  it('round-trips the enabled field of view frame', () => {
    const store = createMemoryStorage();
    const fieldOfView = { focalLengthMm: 18, multiplier: 1.5, sensorHeightMm: 14.9, sensorWidthMm: 22.3 };

    writeViewPreferences(store, { ...DEFAULTS, fieldOfView });

    expect(readViewPreferences(store, DEFAULTS).fieldOfView).toEqual(fieldOfView);
  });

  it('round-trips a wide engine field of view above 180 degrees', () => {
    const store = createMemoryStorage();
    const state = { altitudeDeg: 0, azimuthDeg: 180, fovDeg: 182.28 };

    writeStoredViewState(store, state);

    expect(readStoredViewState(store)).toEqual(state);
  });

  it('treats corrupted JSON as no archive at all', () => {
    const store = createMemoryStorage();
    store.__map.set(STORAGE_KEYS.DEEP_SPACE_VIEW_PREFERENCES, '{"version":1,');

    expect(readViewPreferences(store, DEFAULTS)).toEqual(DEFAULTS);
  });

  it('ignores an archive written by a different schema version', () => {
    const store = createMemoryStorage();
    store.__map.set(STORAGE_KEYS.DEEP_SPACE_VIEW_PREFERENCES, JSON.stringify({ skyLayers: { starLabels: false }, version: VIEW_PREFERENCES_VERSION + 1 }));

    expect(readViewPreferences(store, DEFAULTS)).toEqual(DEFAULTS);
  });
});

describe('deep-space view preference fallbacks', () => {
  it('falls back per field when a stored value has the wrong type or range', () => {
    const store = createMemoryStorage();
    store.__map.set(STORAGE_KEYS.DEEP_SPACE_VIEW_PREFERENCES, JSON.stringify({
      currentCulture: 'chinese',
      environment: { bortleIndex: 42, cardinals: 'yes', fog: false, turbidity: -3 },
      fieldOfView: { focalLengthMm: 0, multiplier: 1, sensorHeightMm: 15, sensorWidthMm: 22 },
      gridLines: { azimuthal: 1, ecliptic: true, equator: null, equatorial_j2000: false },
      landscapeId: 'not_a_real_landscape',
      nightMode: 'true',
      skyLayers: {
        dsoHintsOffset: 50,
        landscape: false,
        starLabels: 'yes',
        starHintsOffset: 2.5,
      },
      version: VIEW_PREFERENCES_VERSION,
    }));

    const restored = readViewPreferences(store, DEFAULTS);

    // Legal neighbours survive; only the damaged field falls back.
    expect(restored.currentCulture).toBe('chinese');
    expect(restored.environment).toEqual({ bortleIndex: 1, cardinals: true, fog: false, turbidity: 0.96 });
    expect(restored.fieldOfView).toBeUndefined();
    expect(restored.gridLines).toEqual({ ...DEFAULTS.gridLines, ecliptic: true });
    expect(restored.landscapeId).toBe('guereins');
    expect(restored.nightMode).toBe(false);
    expect(restored.skyLayers).toEqual({
      ...DEFAULTS.skyLayers,
      dsoHintsOffset: 0,
      landscape: false,
      starHintsOffset: 2.5,
    });
  });

  it('keeps an unknown sky culture at the default', () => {
    const store = createMemoryStorage();
    store.__map.set(STORAGE_KEYS.DEEP_SPACE_VIEW_PREFERENCES, JSON.stringify({
      currentCulture: 'not_a_real_culture',
      version: VIEW_PREFERENCES_VERSION,
    }));

    expect(readViewPreferences(store, DEFAULTS).currentCulture).toBe('western');
  });

  it('clears the archived preferences and camera view on reset', () => {
    const store = createMemoryStorage();
    writeViewPreferences(store, { ...DEFAULTS, nightMode: true });
    writeStoredViewState(store, { altitudeDeg: 10, azimuthDeg: 20, fovDeg: 30 });

    clearViewPreferences(store);

    expect(store.__map.has(STORAGE_KEYS.DEEP_SPACE_VIEW_PREFERENCES)).toBe(false);
    expect(store.__map.has(STORAGE_KEYS.DEEP_SPACE_VIEW_STATE)).toBe(false);
    expect(readViewPreferences(store, DEFAULTS)).toEqual(DEFAULTS);
    expect(readStoredViewState(store)).toBeNull();
  });

  it('signs equal values equally even when a restored object keeps another key order', () => {
    const reread = { ...DEFAULTS, skyLayers: { ...DEFAULTS.skyLayers } };
    // Reading the archive rebuilds skyLayers with the hint offsets last; the
    // signature must not care, or reopening a page would look like a change.
    const reordered = Object.fromEntries(Object.entries(reread.skyLayers).reverse()) as typeof reread.skyLayers;

    expect(viewPreferencesSignature({ ...reread, skyLayers: reordered })).toBe(viewPreferencesSignature(DEFAULTS));
  });
});

describe('deep-space archived camera view', () => {
  it('round-trips a legal view', () => {
    const store = createMemoryStorage();
    const state = { altitudeDeg: -12.5, azimuthDeg: 271.25, fovDeg: 42.5 };

    writeStoredViewState(store, state);

    expect(readStoredViewState(store)).toEqual(state);
  });

  it.each([
    ['corrupted JSON', '{"version":1,'],
    ['a schema from another version', JSON.stringify({ state: { altitudeDeg: 0, azimuthDeg: 0, fovDeg: 40 }, version: 99 })],
    ['an out-of-range azimuth', JSON.stringify({ state: { altitudeDeg: 0, azimuthDeg: 360, fovDeg: 40 }, version: VIEW_PREFERENCES_VERSION })],
    ['an out-of-range field of view', JSON.stringify({ state: { altitudeDeg: 0, azimuthDeg: 10, fovDeg: 400 }, version: VIEW_PREFERENCES_VERSION })],
    ['a non-finite altitude', JSON.stringify({ state: { altitudeDeg: 'high', azimuthDeg: 10, fovDeg: 40 }, version: VIEW_PREFERENCES_VERSION })],
  ])('returns null for %s', (_label, raw) => {
    const store = createMemoryStorage();
    store.__map.set(STORAGE_KEYS.DEEP_SPACE_VIEW_STATE, raw);

    expect(readStoredViewState(store)).toBeNull();
  });
});
