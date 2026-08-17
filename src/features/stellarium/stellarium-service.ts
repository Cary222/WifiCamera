import type { RefObject } from 'react';
import type { WebView } from 'react-native-webview';

/** The v1 protocol uses degrees for RA, Dec, and FOV. */
export type StellariumCommand
  = | { type: 'goto_radec'; raDeg: number; decDeg: number; duration?: number }
    | { type: 'zoom_to'; fovDeg: number; duration?: number }
    | { type: 'search_target'; name: string }
    | { type: 'toggle_constellations'; visible: boolean }
    | { type: 'set_fov_frame'; fovDeg: number; sensorW: number; sensorH: number };

type BridgeOptions = {
  onError?: (message: string) => void;
  onReload?: () => void;
};

export type StellariumBridge = {
  gotoRaDec: (raDeg: number, decDeg: number, duration?: number) => void;
  zoomTo: (fovDeg: number, duration?: number) => void;
  searchTarget: (name: string) => void;
  toggleConstellations: (visible: boolean) => void;
  setFovFrame: (fovDeg: number, sensorW: number, sensorH: number) => void;
  reload: () => void;
};

export type StellariumBridgeInternal = StellariumBridge & {
  setReady: (ready: boolean) => void;
};

const MAX_QUEUED_COMMANDS = 50;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
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
    case 'search_target':
      if (typeof command.name !== 'string' || !command.name.trim())
        return 'Search target must be a non-empty string.';
      break;
    case 'toggle_constellations':
      if (typeof command.visible !== 'boolean')
        return 'Constellation visibility must be a boolean.';
      break;
    case 'set_fov_frame':
      if (!isFiniteNumber(command.fovDeg) || command.fovDeg <= 0 || !isFiniteNumber(command.sensorW) || command.sensorW <= 0 || !isFiniteNumber(command.sensorH) || command.sensorH <= 0)
        return 'FOV frame values must be positive numbers.';
      break;
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
  const queued: StellariumCommand[] = [];
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
    gotoRaDec: (raDeg, decDeg, duration = 0.5) => send({ type: 'goto_radec', raDeg, decDeg, duration }),
    zoomTo: (fovDeg, duration = 0.3) => send({ type: 'zoom_to', fovDeg, duration }),
    searchTarget: name => send({ type: 'search_target', name }),
    toggleConstellations: visible => send({ type: 'toggle_constellations', visible }),
    setFovFrame: (fovDeg, sensorW, sensorH) => send({ type: 'set_fov_frame', fovDeg, sensorW, sensorH }),
    reload: () => {
      ready = false;
      options.onReload?.();
    },
    setReady: (nextReady) => {
      ready = nextReady;
      if (ready)
        flush();
    },
  };
}
