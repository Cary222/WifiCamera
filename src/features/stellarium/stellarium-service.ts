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
    | { type: 'set_grid_lines' } & StellariumGridLines
    | { type: 'set_location'; latitudeDeg: number; longitudeDeg: number }
    | { type: 'set_view_bearing'; azimuthDeg: number }
    | { type: 'set_fov_frame'; fovDeg: number; sensorW: number; sensorH: number }
    | { type: 'compute_tonight'; isoDate: string; latitudeDeg: number; longitudeDeg: number; requestId: number }
    | { type: 'compute_events'; isoStart: string; days: number; latitudeDeg: number; longitudeDeg: number; requestId: number };

export type SelectedCelestialObject = {
  altDeg?: number | null;
  azDeg?: number | null;
  constellationZh?: string | null;
  decDeg: number;
  decJ2000Deg?: number | null;
  designations: string[];
  distanceAu?: number | null;
  englishName: string;
  hourAngleHours?: number | null;
  id: string;
  name: string;
  phase?: number | null;
  raHours: number;
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
  setGridLines: (lines: StellariumGridLines) => void;
  setLocation: (latitudeDeg: number, longitudeDeg: number) => void;
  setViewBearing: (azimuthDeg: number) => void;
  setFovFrame: (fovDeg: number, sensorW: number, sensorH: number) => void;
  computeTonight: (date: Date, observer: ObserverLocation) => Promise<TonightReport>;
  computeEvents: (start: Date, days: number, observer: ObserverLocation) => Promise<SkyEvent[]>;
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
      break;
    case 'point_and_lock':
      if (command.name !== undefined && (typeof command.name !== 'string' || !command.name.trim()))
        return 'Target name must be a non-empty string.';
      break;
    case 'search_target':
      if (typeof command.name !== 'string' || !command.name.trim())
        return 'Search target must be a non-empty string.';
      break;
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
    case 'set_grid_lines':
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
export function createStellariumBridge(webViewRef: RefObject<WebView | null>, options: BridgeOptions = {}): StellariumBridgeInternal {
  let ready = false;
  let nextRequestId = 0;
  const queued: StellariumCommand[] = [];
  const pending = new Map<number, { resolve: (payload: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const request = <T>(build: (requestId: number) => StellariumCommand): Promise<T> => {
    const requestId = ++nextRequestId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error('Stellarium calculation timed out.'));
      }, REQUEST_TIMEOUT_MS);
      pending.set(requestId, { reject, resolve: resolve as (payload: unknown) => void, timer });
      send(build(requestId));
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
    toggleConstellations: visible => send({ type: 'toggle_constellations', visible }),
    setSkyLayers: layers => send({ type: 'set_sky_layers', ...layers }),
    setSkyCulture: (id, target) => send({ type: 'set_sky_culture', id, ...(target ? { target } : {}) }),
    setTime: date => send({ type: 'set_time', isoTime: date.toISOString() }),
    setGridLines: lines => send({ type: 'set_grid_lines', ...lines }),
    setLandscape: id => send({ type: 'set_landscape', id }),
    setEnvironment: patch => send({ type: 'set_environment', ...patch }),
    setLocation: (latitudeDeg, longitudeDeg) => send({ type: 'set_location', latitudeDeg, longitudeDeg }),
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
    reload: () => {
      ready = false;
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
