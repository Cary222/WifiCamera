/**
 * StellariumService — JS Bridge wrapper for the Stellarium WebView.
 * Provides type-safe methods to control the Stellarium Web Engine
 * via postMessage(JSON) using the format defined in 参考-技术方案.md.
 */

export type StellariumBridge = {
  gotoRaDec: (ra: number, dec: number, duration?: number) => void;
  zoomTo: (fovDeg: number, duration?: number) => void;
  searchTarget: (name: string) => void;
  toggleConstellations: (visible: boolean) => void;
  setFovFrame: (fovDeg: number, sensorW: number, sensorH: number) => void;
};

export function createStellariumBridge(
  postMessage: (msg: unknown) => void,
): StellariumBridge {
  return {
    gotoRaDec: (ra, dec, duration = 0.5) =>
      postMessage({ type: 'goto_radec', ra, dec, duration }),

    zoomTo: (fovDeg, duration = 0.3) =>
      postMessage({ type: 'zoom_to', fov: fovDeg, duration }),

    searchTarget: name =>
      postMessage({ type: 'search_target', name }),

    toggleConstellations: visible =>
      postMessage({ type: 'toggle_constellations', visible }),

    setFovFrame: (fovDeg, sensorW, sensorH) =>
      postMessage({ type: 'set_fov_frame', fov: fovDeg, sensorW, sensorH }),
  };
}
