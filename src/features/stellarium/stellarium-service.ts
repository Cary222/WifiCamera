import type { RefObject } from 'react';
import type { WebView } from 'react-native-webview';

/** The v1 protocol uses degrees for RA, Dec, and FOV. */
export type StellariumSkyLayers = {
  atmosphere?: boolean;
  constellationArt?: boolean;
  constellationBoundaries?: boolean;
  constellationLabels?: boolean;
  constellationLines?: boolean;
  constellationOnlyPointed?: boolean;
  dsoHintsOffset?: number;
  dsoLabels?: boolean;
  landscape?: boolean;
  planetHintsOffset?: number;
  planetLabels?: boolean;
  satelliteHintsOffset?: number;
  satelliteLabels?: boolean;
  starHintsOffset?: number;
  starLabels?: boolean;
};

export type StellariumGridLines = {
  azimuthal?: boolean;
  ecliptic?: boolean;
  equator?: boolean;
  equatorial_j2000?: boolean;
  equatorial_jnow?: boolean;
  meridian?: boolean;
};

export type StellariumEnvironment = {
  /** Bortle dark-sky scale: 1 = pristine dark sky, 9 = inner-city skyglow. */
  bortleIndex?: number;
  cardinals?: boolean;
  fog?: boolean;
  landscapeTint?: [number, number, number, number];
  turbidity?: number;
};

/** Camera view archived across visits so the map reopens on the observer's last angle. */
export type StellariumViewState = {
  altitudeDeg: number;
  azimuthDeg: number;
  fovDeg: number;
};

export type StellariumSearchCatalogItem = {
  id: string;
  nameEn: string;
  nameZh: string;
  category: string;
  aliases?: string[];
  engineIds?: string[];
  constellationZh?: string;
};

export type TargetLookupReason = 'available' | 'loading' | 'not_found' | 'missing_data' | 'culture_mismatch';

export class StellariumTargetLookupError extends Error {
  constructor(public readonly reason: Exclude<TargetLookupReason, 'available'>) {
    super(`FOCUS_UNAVAILABLE:${reason}`);
    this.name = 'StellariumTargetLookupError';
  }
}

export type StellariumCommand
  = | { type: 'goto_radec'; raDeg: number; decDeg: number; duration?: number }
    | { type: 'zoom_to'; fovDeg: number; duration?: number }
    | { type: 'clear_selection' }
    | { type: 'point_and_lock'; name?: string }
    | { type: 'search_target'; name: string }
    | { type: 'toggle_constellations'; visible: boolean }
    | { type: 'set_sky_layers' } & StellariumSkyLayers
    | { type: 'set_landscape'; id: string }
    | { type: 'set_environment' } & StellariumEnvironment
    | { type: 'set_sky_culture'; id: string; target?: string }
    | { type: 'set_time'; isoTime: string }
    | { type: 'set_magnitude_limit'; magnitude: number }
    | { type: 'set_brightness'; brightness: number }
    | { type: 'set_grid_lines' } & StellariumGridLines
    | { type: 'set_location'; latitudeDeg: number; longitudeDeg: number }
    | { type: 'restore_view'; state: StellariumViewState | null }
    | { type: 'set_view_bearing'; azimuthDeg: number }
    | { type: 'set_fov_frame'; fovDeg: number; sensorW: number; sensorH: number }
    | { type: 'compute_tonight'; isoDate: string; latitudeDeg: number; longitudeDeg: number; requestId: number }
    | { type: 'compute_events'; isoStart: string; days: number; latitudeDeg: number; longitudeDeg: number; requestId: number }
    | { type: 'get_object_info'; name: string; requestId: number }
    | { type: 'set_search_catalog'; items: readonly StellariumSearchCatalogItem[] }
    | { type: 'query_targets'; names: string[]; requestId: number }
    | { type: 'focus_target'; name: string; fovDeg?: number; requestId: number; token: number }
    | { type: 'cancel_search'; token: number };

export type TargetQueryResult = {
  id: string;
  available: boolean;
  canonicalId?: string;
  reason?: TargetLookupReason;
  altDeg?: number | null;
  azDeg?: number | null;
  vmag?: number | null;
};

export type SelectedCelestialObject = {
  /** Stable search/history/favorite key; id remains the native engine identifier. */
  catalogId?: string;
  altDeg?: number | null;
  azDeg?: number | null;
  constellationZh?: string | null;
  coordinateFrame?: 'CIRS';
  decDeg: number | null;
  decJ2000Deg?: number | null;
  designations: string[];
  distanceAu?: number | null;
  englishName: string;
  hourAngleHours?: number | null;
  id: string;
  name: string;
  phase?: number | null;
  raHours: number | null;
  raJ2000Hours?: number | null;
  sizeArcsec?: number | null;
  type?: string;
  typeZh?: string;
  vmag?: number | null;
};

export type ObserverLocation = { latitudeDeg: number; longitudeDeg: number };

export type TonightPlanet = {
  key: string;
  from: string;
  to: string;
  peakAltitudeDeg: number;
  magnitude: number;
};

export type TonightReport = {
  sunset: string | null;
  sunrise: string | null;
  duskEnd: string | null;
  dawnStart: string | null;
  moon: { illumination: number; phase: string; rise: string | null; set: string | null };
  planets: TonightPlanet[];
};

export type SkyEvent = {
  type: string;
  time: string;
  target?: string;
  name?: string;
  zhr?: number;
};

type BridgeOptions = {
  onError?: (message: string) => void;
  onReload?: () => void;
};

export type StellariumBridge = {
  clearSelection: () => void;
  gotoRaDec: (raDeg: number, decDeg: number, duration?: number) => void;
  pointAndLock: (name?: string) => void;
  zoomTo: (fovDeg: number, duration?: number) => void;
  searchTarget: (name: string) => void;
  toggleConstellations: (visible: boolean) => void;
  setSkyLayers: (layers: StellariumSkyLayers) => void;
  setLandscape: (id: string) => void;
  setEnvironment: (patch: StellariumEnvironment) => void;
  setSkyCulture: (id: string, target?: string) => void;
  setTime: (date: Date) => void;
  setMagnitudeLimit: (magnitude: number) => void;
  setBrightness: (brightness: number) => void;
  setGridLines: (lines: StellariumGridLines) => void;
  setLocation: (latitudeDeg: number, longitudeDeg: number) => void;
  /** Replays the archived camera angle; null only opens the view-reporting channel. */
  restoreView: (state: StellariumViewState | null) => void;
  setViewBearing: (azimuthDeg: number) => void;
  setFovFrame: (fovDeg: number, sensorW: number, sensorH: number) => void;
  computeTonight: (date: Date, observer: ObserverLocation) => Promise<TonightReport>;
  computeEvents: (start: Date, days: number, observer: ObserverLocation) => Promise<SkyEvent[]>;
  getObjectInfo: (name: string) => Promise<SelectedCelestialObject | null>;
  setSearchCatalog: (items: readonly StellariumSearchCatalogItem[]) => void;
  queryTargets: (names: string[]) => Promise<TargetQueryResult[]>;
  focusTarget: (name: string, fovDeg?: number) => Promise<SelectedCelestialObject | null>;
  cancelSearch: () => void;
  reload: () => void;
};

export type StellariumBridgeInternal = StellariumBridge & {
  setReady: (ready: boolean) => void;
  resolveRequest: (requestId: number, payload: unknown) => void;
};

const MAX_QUEUED_COMMANDS = 50;
const REQUEST_TIMEOUT_MS = 20_000;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

const VIEW_STATE_ERROR = 'Invalid view state.';

/**
 * Accepts a finite in-range view report and strips every other field.
 * Azimuth stays inside [0, 360); the scene normalizes 360 to 0 before reporting.
 * The field of view follows the engine's own zoom range (0, 360], so a
 * wide-angle view at 182° is archived and restored like any other.
 */
export function parseStellariumViewState(value: unknown): StellariumViewState | null {
  if (!value || typeof value !== 'object')
    return null;
  const { altitudeDeg, azimuthDeg, fovDeg } = value as Partial<StellariumViewState>;
  if (!isFiniteNumber(azimuthDeg) || azimuthDeg < 0 || azimuthDeg >= 360)
    return null;
  if (!isFiniteNumber(altitudeDeg) || altitudeDeg < -90 || altitudeDeg > 90)
    return null;
  if (!isFiniteNumber(fovDeg) || fovDeg <= 0 || fovDeg > 360)
    return null;
  return { altitudeDeg, azimuthDeg, fovDeg };
}

function validateObserver(latitudeDeg: number, longitudeDeg: number): string | undefined {
  if (!isFiniteNumber(latitudeDeg) || latitudeDeg < -90 || latitudeDeg > 90)
    return 'Latitude must be between -90 and 90 degrees.';
  if (!isFiniteNumber(longitudeDeg) || longitudeDeg < -180 || longitudeDeg > 180)
    return 'Longitude must be between -180 and 180 degrees.';
}

function validateEnvironment(command: Extract<StellariumCommand, { type: 'set_environment' }>): string | undefined {
  if ([command.cardinals, command.fog].some(value => value !== undefined && typeof value !== 'boolean'))
    return 'Environment toggles must be booleans.';
  if (command.bortleIndex !== undefined
    && (!Number.isInteger(command.bortleIndex) || command.bortleIndex < 1 || command.bortleIndex > 9)) {
    return 'Bortle index must be an integer between 1 and 9.';
  }
  // The engine starts at 0.96, so a floor of 1 would reject its own default
  // and make the atmosphere panel unable to restore the initial sky.
  if (command.turbidity !== undefined && (!isFiniteNumber(command.turbidity) || command.turbidity < 0 || command.turbidity > 10))
    return 'Turbidity must be between 0 and 10.';
  if (command.landscapeTint !== undefined
    && (!Array.isArray(command.landscapeTint)
      || command.landscapeTint.length !== 4
      || command.landscapeTint.some(value => !isFiniteNumber(value) || value < 0 || value > 1))) {
    return 'Landscape tint must be four values between 0 and 1.';
  }
}

function validateMagnitudeLimit(magnitude: number): string | undefined {
  if (!isFiniteNumber(magnitude) || magnitude < 3.5 || magnitude > 99)
    return 'Magnitude limit must be between 3.5 and 99.';
}

function validateBrightness(brightness: number): string | undefined {
  if (!isFiniteNumber(brightness) || brightness < 0.1 || brightness > 10)
    return 'Brightness must be between 0.1 and 10.';
}

function validateGridLines(command: Extract<StellariumCommand, { type: 'set_grid_lines' }>): string | undefined {
  if ([
    command.azimuthal,
    command.ecliptic,
    command.equator,
    command.equatorial_j2000,
    command.equatorial_jnow,
    command.meridian,
  ].some(value => value !== undefined && typeof value !== 'boolean')) {
    return 'Grid line values must be booleans.';
  }
}

function validateSearchCommand(
  command: Extract<StellariumCommand, { type: 'query_targets' | 'focus_target' | 'search_target' | 'point_and_lock' }>,
): string | undefined {
  if (command.type === 'point_and_lock') {
    if (command.name !== undefined && (typeof command.name !== 'string' || !command.name.trim()))
      return 'Target name must be a non-empty string.';
    return;
  }
  if (command.type === 'search_target') {
    if (typeof command.name !== 'string' || !command.name.trim())
      return 'Search target must be a non-empty string.';
    return;
  }
  if (command.type === 'query_targets') {
    if (!Array.isArray(command.names))
      return 'queryTargets requires an array of target names.';
    if (command.names.length > 100)
      return 'queryTargets accepts at most 100 names.';
    if (command.names.some(n => typeof n !== 'string' || !n.trim()))
      return 'Each target name must be a non-empty string.';
    return;
  }
  if (typeof command.name !== 'string' || !command.name.trim())
    return 'Target name must be a non-empty string.';
  if (command.fovDeg !== undefined && (!isFiniteNumber(command.fovDeg) || command.fovDeg <= 0 || command.fovDeg > 360))
    return 'FOV must be greater than 0 and no more than 360 degrees.';
}

function validate(command: StellariumCommand): string | undefined {
  switch (command.type) {
    case 'goto_radec':
      if (!isFiniteNumber(command.raDeg) || command.raDeg < 0 || command.raDeg > 360)
        return 'RA must be between 0 and 360 degrees.';
      if (!isFiniteNumber(command.decDeg) || command.decDeg < -90 || command.decDeg > 90)
        return 'Dec must be between -90 and 90 degrees.';
      break;
    case 'zoom_to':
      if (!isFiniteNumber(command.fovDeg) || command.fovDeg <= 0 || command.fovDeg > 360)
        return 'FOV must be greater than 0 and no more than 360 degrees.';
      break;
    case 'clear_selection':
    case 'cancel_search':
      break;
    case 'point_and_lock':
    case 'search_target':
    case 'query_targets':
    case 'focus_target':
      return validateSearchCommand(command);
    case 'toggle_constellations':
      if (typeof command.visible !== 'boolean')
        return 'Constellation visibility must be a boolean.';
      break;
    case 'set_sky_layers':
      if ([
        command.atmosphere,
        command.constellationArt,
        command.constellationBoundaries,
        command.constellationLabels,
        command.constellationLines,
        command.constellationOnlyPointed,
        command.dsoLabels,
        command.landscape,
        command.planetLabels,
        command.satelliteLabels,
        command.starLabels,
      ].some(value => value !== undefined && typeof value !== 'boolean')) {
        return 'Sky layer values must be booleans.';
      }
      if ([
        command.dsoHintsOffset,
        command.planetHintsOffset,
        command.satelliteHintsOffset,
        command.starHintsOffset,
      ].some(value => value !== undefined && (!isFiniteNumber(value) || value < -20 || value > 20))) {
        return 'Hint magnitude offset must be a finite number between -20 and 20.';
      }
      break;
    case 'set_landscape':
      if (typeof command.id !== 'string' || !/^[\w-]+$/.test(command.id))
        return 'Landscape id must be a simple identifier.';
      break;
    case 'set_environment':
      return validateEnvironment(command);
    case 'set_sky_culture':
      if (typeof command.id !== 'string' || !/^[\w-]+$/.test(command.id))
        return 'Sky culture id must be a simple identifier.';
      if (command.target !== undefined && (typeof command.target !== 'string' || !/^[\w .-]+$/.test(command.target)))
        return 'Sky culture target must be a simple designation.';
      break;
    case 'set_time':
      if (typeof command.isoTime !== 'string' || Number.isNaN(Date.parse(command.isoTime)))
        return 'Time must be a valid ISO timestamp.';
      break;
    case 'set_magnitude_limit':
      return validateMagnitudeLimit(command.magnitude);
    case 'set_brightness':
      return validateBrightness(command.brightness);
    case 'set_grid_lines':
      return validateGridLines(command);
    case 'restore_view':
      if (command.state !== null && !parseStellariumViewState(command.state))
        return VIEW_STATE_ERROR;
      break;
    case 'set_location':
      if (!isFiniteNumber(command.latitudeDeg) || command.latitudeDeg < -90 || command.latitudeDeg > 90)
        return 'Latitude must be between -90 and 90 degrees.';
      if (!isFiniteNumber(command.longitudeDeg) || command.longitudeDeg < -180 || command.longitudeDeg > 180)
        return 'Longitude must be between -180 and 180 degrees.';
      break;
    case 'set_view_bearing':
      if (!isFiniteNumber(command.azimuthDeg) || command.azimuthDeg < 0 || command.azimuthDeg > 360)
        return 'Azimuth must be between 0 and 360 degrees.';
      break;
    case 'set_fov_frame':
      if (!isFiniteNumber(command.fovDeg) || command.fovDeg <= 0 || !isFiniteNumber(command.sensorW) || command.sensorW <= 0 || !isFiniteNumber(command.sensorH) || command.sensorH <= 0)
        return 'FOV frame values must be positive numbers.';
      break;
    case 'compute_tonight':
      if (typeof command.isoDate !== 'string' || Number.isNaN(Date.parse(command.isoDate)))
        return 'Calendar date must be a valid ISO timestamp.';
      return validateObserver(command.latitudeDeg, command.longitudeDeg);
    case 'compute_events':
      if (typeof command.isoStart !== 'string' || Number.isNaN(Date.parse(command.isoStart)))
        return 'Calendar range must start at a valid ISO timestamp.';
      if (!isFiniteNumber(command.days) || command.days < 1 || command.days > 400)
        return 'Calendar range must span between 1 and 400 days.';
      return validateObserver(command.latitudeDeg, command.longitudeDeg);
  }
  if ('duration' in command && command.duration !== undefined && (!isFiniteNumber(command.duration) || command.duration < 0))
    return 'Animation duration must be a non-negative number.';
}

function postCommand(webViewRef: RefObject<WebView | null>, command: StellariumCommand): boolean {
  const webView = webViewRef.current;
  if (!webView)
    return false;
  webView.postMessage(JSON.stringify(command));
  return true;
}

/** Queues commands until either `ready` or legacy `engine_ready` arrives. */
// eslint-disable-next-line max-lines-per-function
export function createStellariumBridge(webViewRef: RefObject<WebView | null>, options: BridgeOptions = {}): StellariumBridgeInternal {
  let ready = false;
  let nextRequestId = 0;
  let activeFocusToken = 0;
  const queued: StellariumCommand[] = [];
  const pending = new Map<number, { type: StellariumCommand['type']; resolve: (payload: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const removeQueuedRequest = (requestId: number) => {
    const index = queued.findIndex(command => 'requestId' in command && command.requestId === requestId);
    if (index >= 0)
      queued.splice(index, 1);
  };
  const cancelPendingFocus = () => {
    for (const [requestId, entry] of pending) {
      if (entry.type !== 'focus_target')
        continue;
      clearTimeout(entry.timer);
      pending.delete(requestId);
      removeQueuedRequest(requestId);
      entry.resolve(null);
    }
  };
  const request = <T>(build: (requestId: number) => StellariumCommand): Promise<T> => {
    const requestId = ++nextRequestId;
    const command = build(requestId);
    const error = validate(command);
    if (error) {
      options.onError?.(error);
      return Promise.reject(new Error(error));
    }
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        removeQueuedRequest(requestId);
        reject(new Error('Stellarium calculation timed out.'));
      }, REQUEST_TIMEOUT_MS);
      pending.set(requestId, { type: command.type, reject, resolve: resolve as (payload: unknown) => void, timer });
      send(command);
    });
  };
  const send = (command: StellariumCommand) => {
    const error = validate(command);
    if (error)
      return options.onError?.(error);
    if (!ready) {
      if (queued.length === MAX_QUEUED_COMMANDS)
        queued.shift();
      queued.push(command);
      return;
    }
    if (!postCommand(webViewRef, command))
      options.onError?.('Stellarium WebView is unavailable.');
  };
  const flush = () => {
    if (!ready)
      return;
    while (queued.length > 0) {
      const command = queued.shift();
      if (command && !postCommand(webViewRef, command)) {
        options.onError?.('Stellarium WebView is unavailable.');
        break;
      }
    }
  };
  return {
    clearSelection: () => send({ type: 'clear_selection' }),
    gotoRaDec: (raDeg, decDeg, duration = 0.5) => send({ type: 'goto_radec', raDeg, decDeg, duration }),
    pointAndLock: name => send({ type: 'point_and_lock', ...(name ? { name } : {}) }),
    zoomTo: (fovDeg, duration = 0.3) => send({ type: 'zoom_to', fovDeg, duration }),
    searchTarget: name => send({ type: 'search_target', name }),
    setSearchCatalog: items => send({ type: 'set_search_catalog', items }),
    toggleConstellations: visible => send({ type: 'toggle_constellations', visible }),
    setSkyLayers: layers => send({ type: 'set_sky_layers', ...layers }),
    setSkyCulture: (id, target) => send({ type: 'set_sky_culture', id, ...(target ? { target } : {}) }),
    setTime: date => send({ type: 'set_time', isoTime: date.toISOString() }),
    setMagnitudeLimit: magnitude => send({ type: 'set_magnitude_limit', magnitude }),
    setBrightness: brightness => send({ type: 'set_brightness', brightness }),
    setGridLines: lines => send({ type: 'set_grid_lines', ...lines }),
    setLandscape: id => send({ type: 'set_landscape', id }),
    setEnvironment: patch => send({ type: 'set_environment', ...patch }),
    setLocation: (latitudeDeg, longitudeDeg) => send({ type: 'set_location', latitudeDeg, longitudeDeg }),
    restoreView: state => send({ type: 'restore_view', state }),
    setViewBearing: azimuthDeg => send({ type: 'set_view_bearing', azimuthDeg }),
    setFovFrame: (fovDeg, sensorW, sensorH) => send({ type: 'set_fov_frame', fovDeg, sensorW, sensorH }),
    computeTonight: (date, observer) => request<TonightReport>(requestId => ({
      type: 'compute_tonight',
      isoDate: date.toISOString(),
      latitudeDeg: observer.latitudeDeg,
      longitudeDeg: observer.longitudeDeg,
      requestId,
    })),
    computeEvents: (start, days, observer) => request<{ events: SkyEvent[] }>(requestId => ({
      type: 'compute_events',
      isoStart: start.toISOString(),
      days,
      latitudeDeg: observer.latitudeDeg,
      longitudeDeg: observer.longitudeDeg,
      requestId,
    })).then(payload => payload.events),
    getObjectInfo: (name: string) => {
      if (typeof name !== 'string' || !name.trim())
        return Promise.reject(new Error('Target name must be a non-empty string.'));
      return request<SelectedCelestialObject | null>(requestId => ({ type: 'get_object_info', name: name.trim(), requestId }));
    },
    queryTargets: (names: string[]) => {
      if (!Array.isArray(names))
        return Promise.reject(new Error('queryTargets requires an array of target names.'));
      if (names.length > 100)
        return Promise.reject(new Error('queryTargets accepts at most 100 names.'));
      if (names.some(n => typeof n !== 'string' || !n.trim()))
        return Promise.reject(new Error('Each target name must be a non-empty string.'));
      return request<TargetQueryResult[]>(requestId => ({
        type: 'query_targets',
        names,
        requestId,
      })).then((targets) => {
        return (targets || []).map((t, index) => ({
          id: t?.id ?? names[index],
          available: Boolean(t?.available),
          ...(t?.available && typeof t.canonicalId === 'string' ? { canonicalId: t.canonicalId } : {}),
          ...(t?.reason && ['available', 'loading', 'not_found', 'missing_data', 'culture_mismatch'].includes(t.reason)
            ? { reason: t.reason }
            : {}),
          ...(isFiniteNumber(t?.altDeg) ? { altDeg: t.altDeg } : (t?.altDeg === null ? { altDeg: null } : {})),
          ...(isFiniteNumber(t?.azDeg) ? { azDeg: t.azDeg } : (t?.azDeg === null ? { azDeg: null } : {})),
          ...(isFiniteNumber(t?.vmag) ? { vmag: t.vmag } : (t?.vmag === null ? { vmag: null } : {})),
        }));
      });
    },
    focusTarget: (name: string, fovDeg?: number) => {
      if (typeof name !== 'string' || !name.trim())
        return Promise.reject(new Error('Target name must be a non-empty string.'));
      if (fovDeg !== undefined && (!isFiniteNumber(fovDeg) || fovDeg <= 0 || fovDeg > 360))
        return Promise.reject(new Error('FOV must be greater than 0 and no more than 360 degrees.'));

      const token = ++activeFocusToken;
      cancelPendingFocus();
      return request<SelectedCelestialObject | { unavailableReason: Exclude<TargetLookupReason, 'available'> } | null>(requestId => ({
        type: 'focus_target',
        name: name.trim(),
        ...(fovDeg !== undefined ? { fovDeg } : {}),
        requestId,
        token,
      })).then((payload) => {
        if (activeFocusToken !== token) {
          return null;
        }
        if (payload && 'unavailableReason' in payload)
          throw new StellariumTargetLookupError(payload.unavailableReason);
        return payload || null;
      });
    },
    cancelSearch: () => {
      // Bump and share the token so the WebView invalidates only the focus
      // requests issued so far, without poisoning the counter space (Date.now()
      // would exceed every future token and break all later focusTarget calls).
      const token = ++activeFocusToken;
      cancelPendingFocus();
      send({ type: 'cancel_search', token });
    },
    reload: () => {
      ready = false;
      activeFocusToken++;
      for (const [, entry] of pending.entries()) {
        clearTimeout(entry.timer);
        entry.reject(new Error('Stellarium bridge reloaded.'));
      }
      pending.clear();
      queued.length = 0;
      options.onReload?.();
    },
    setReady: (nextReady) => {
      ready = nextReady;
      if (ready)
        flush();
    },
    resolveRequest: (requestId, payload) => {
      const entry = pending.get(requestId);
      if (!entry)
        return;
      clearTimeout(entry.timer);
      pending.delete(requestId);
      entry.resolve(payload);
    },
  };
}
