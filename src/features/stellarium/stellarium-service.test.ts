import type { RefObject } from 'react';
import type { WebView } from 'react-native-webview';

import { createStellariumBridge } from './stellarium-service';

function createBridgeHarness() {
  const postMessage = jest.fn();
  const webViewRef = {
    current: { postMessage },
  } as unknown as RefObject<WebView | null>;

  return {
    bridge: createStellariumBridge(webViewRef),
    postMessage,
  };
}

describe('stellarium sky layers and culture bridge', () => {
  it('posts typed sky-layer changes after the engine is ready', () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);

    bridge.setSkyLayers({
      atmosphere: true,
      constellationArt: true,
      constellationBoundaries: false,
      constellationLabels: true,
      constellationLines: true,
      constellationOnlyPointed: false,
      dsoHintsOffset: 1.5,
      dsoLabels: true,
      landscape: true,
      planetHintsOffset: 0,
      planetLabels: true,
      satelliteHintsOffset: -2.0,
      satelliteLabels: true,
      starHintsOffset: 2.5,
      starLabels: true,
    });

    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({
      type: 'set_sky_layers',
      atmosphere: true,
      constellationArt: true,
      constellationBoundaries: false,
      constellationLabels: true,
      constellationLines: true,
      constellationOnlyPointed: false,
      dsoHintsOffset: 1.5,
      dsoLabels: true,
      landscape: true,
      planetHintsOffset: 0,
      planetLabels: true,
      satelliteHintsOffset: -2.0,
      satelliteLabels: true,
      starHintsOffset: 2.5,
      starLabels: true,
    }));
  });

  it('rejects an out-of-range hint magnitude offset', () => {
    const onError = jest.fn();
    const postMessage = jest.fn();
    const webViewRef = { current: { postMessage } } as unknown as RefObject<WebView | null>;
    const bridge = createStellariumBridge(webViewRef, { onError });
    bridge.setReady(true);

    bridge.setSkyLayers({ starHintsOffset: 50 });

    expect(onError).toHaveBeenCalledWith('Hint magnitude offset must be a finite number between -20 and 20.');
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('sends an optional culture target only for an explicit glossary use action', () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);

    bridge.setSkyCulture('chinese', 'CON chinese 236');

    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({
      type: 'set_sky_culture',
      id: 'chinese',
      target: 'CON chinese 236',
    }));
  });
});

describe('stellarium observer and grid bridge', () => {
  it('posts the observer time chosen from the calendar', () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);

    bridge.setTime(new Date('2026-08-20T13:30:00.000Z'));

    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'set_time', isoTime: '2026-08-20T13:30:00.000Z' }));
  });

  it('posts an absolute compass bearing for sensor-follow mode', () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);

    bridge.setViewBearing(123.45);

    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'set_view_bearing', azimuthDeg: 123.45 }));
  });

  it('rejects a compass bearing outside its valid range', () => {
    const onError = jest.fn();
    const postMessage = jest.fn();
    const webViewRef = { current: { postMessage } } as unknown as RefObject<WebView | null>;
    const bridge = createStellariumBridge(webViewRef, { onError });
    bridge.setReady(true);

    bridge.setViewBearing(361);

    expect(onError).toHaveBeenCalledWith('Azimuth must be between 0 and 360 degrees.');
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('posts grid line toggles from the observation tools', () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);

    bridge.setGridLines({
      azimuthal: true,
      ecliptic: true,
      equator: true,
      equatorial_j2000: false,
      equatorial_jnow: true,
      meridian: false,
    });

    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({
      type: 'set_grid_lines',
      azimuthal: true,
      ecliptic: true,
      equator: true,
      equatorial_j2000: false,
      equatorial_jnow: true,
      meridian: false,
    }));
  });

  it('posts the observer location chosen in settings', () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);

    bridge.setLocation(31.23, 121.47);

    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'set_location', latitudeDeg: 31.23, longitudeDeg: 121.47 }));
  });

  it('posts a separate visual magnitude limit from advanced settings', () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);

    bridge.setMagnitudeLimit(5.5);

    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'set_magnitude_limit', magnitude: 5.5 }));
  });

  it('posts display brightness changes from advanced settings', () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);

    bridge.setBrightness(2.5);

    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'set_brightness', brightness: 2.5 }));
  });

  it('rejects an out-of-range observer location', () => {
    const onError = jest.fn();
    const postMessage = jest.fn();
    const webViewRef = { current: { postMessage } } as unknown as RefObject<WebView | null>;
    const bridge = createStellariumBridge(webViewRef, { onError });
    bridge.setReady(true);

    bridge.setLocation(120, 0);

    expect(onError).toHaveBeenCalledWith('Latitude must be between -90 and 90 degrees.');
    expect(postMessage).not.toHaveBeenCalled();
  });
});

describe('stellarium landscape and environment bridge', () => {
  it('posts the landscape chosen from the landscape panel', () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);

    bridge.setLandscape('winterfield');

    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'set_landscape', id: 'winterfield' }));
  });

  it('rejects a landscape id that is not a simple identifier', () => {
    const onError = jest.fn();
    const postMessage = jest.fn();
    const webViewRef = { current: { postMessage } } as unknown as RefObject<WebView | null>;
    const bridge = createStellariumBridge(webViewRef, { onError });
    bridge.setReady(true);

    bridge.setLandscape('../../etc/passwd');

    expect(onError).toHaveBeenCalledWith('Landscape id must be a simple identifier.');
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('posts environment knobs from the landscape panel', () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);

    bridge.setEnvironment({ bortleIndex: 1, cardinals: false, fog: false, turbidity: 6 });

    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({
      type: 'set_environment',
      bortleIndex: 1,
      cardinals: false,
      fog: false,
      turbidity: 6,
    }));
  });

  it('rejects a turbidity outside the range the atmosphere model accepts', () => {
    const onError = jest.fn();
    const postMessage = jest.fn();
    const webViewRef = { current: { postMessage } } as unknown as RefObject<WebView | null>;
    const bridge = createStellariumBridge(webViewRef, { onError });
    bridge.setReady(true);

    bridge.setEnvironment({ turbidity: 40 });

    expect(onError).toHaveBeenCalledWith('Turbidity must be between 0 and 10.');
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('rejects Bortle values outside the engine range', () => {
    const onError = jest.fn();
    const postMessage = jest.fn();
    const webViewRef = { current: { postMessage } } as unknown as RefObject<WebView | null>;
    const bridge = createStellariumBridge(webViewRef, { onError });
    bridge.setReady(true);

    bridge.setEnvironment({ bortleIndex: 0 });

    expect(onError).toHaveBeenCalledWith('Bortle index must be an integer between 1 and 9.');
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('accepts the engine\'s own default turbidity', () => {
    // Measured against a live engine instance: atmosphere.turbidity starts at
    // 0.96, which the previous floor of 1 rejected outright.
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);

    bridge.setEnvironment({ turbidity: 0.96 });

    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({
      type: 'set_environment',
      turbidity: 0.96,
    }));
  });
});

describe('stellarium celestial object selection bridge', () => {
  it('posts clear_selection command', () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);

    bridge.clearSelection();

    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'clear_selection' }));
  });

  it('posts point_and_lock command with valid target', () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);

    bridge.pointAndLock('M 42');

    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'point_and_lock', name: 'M 42' }));
  });
});

describe('stellarium calendar requests', () => {
  it('resolves a tonight calculation with the payload matching its request id', async () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);

    const pending = bridge.computeTonight(new Date('2026-08-21T12:00:00.000Z'), { latitudeDeg: 39.9, longitudeDeg: 116.41 });
    const sent = JSON.parse(postMessage.mock.calls[0][0] as string);

    expect(sent).toMatchObject({ type: 'compute_tonight', isoDate: '2026-08-21T12:00:00.000Z', latitudeDeg: 39.9, longitudeDeg: 116.41 });
    bridge.resolveRequest(sent.requestId, { sunset: '2026-08-21T11:05:00.000Z' });

    await expect(pending).resolves.toEqual({ sunset: '2026-08-21T11:05:00.000Z' });
  });

  it('unwraps the event list so callers never see the transport envelope', async () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);

    const pending = bridge.computeEvents(new Date('2026-08-21T12:00:00.000Z'), 60, { latitudeDeg: 39.9, longitudeDeg: 116.41 });
    const sent = JSON.parse(postMessage.mock.calls[0][0] as string);
    bridge.resolveRequest(sent.requestId, { events: [{ time: '2026-08-28T05:30:00.000Z', type: 'full_moon' }] });

    await expect(pending).resolves.toEqual([{ time: '2026-08-28T05:30:00.000Z', type: 'full_moon' }]);
  });

  it('keeps concurrent calculations apart by request id', async () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);

    const tonight = bridge.computeTonight(new Date('2026-08-21T12:00:00.000Z'), { latitudeDeg: 39.9, longitudeDeg: 116.41 });
    const events = bridge.computeEvents(new Date('2026-08-21T12:00:00.000Z'), 60, { latitudeDeg: 39.9, longitudeDeg: 116.41 });
    const tonightId = JSON.parse(postMessage.mock.calls[0][0] as string).requestId;
    const eventsId = JSON.parse(postMessage.mock.calls[1][0] as string).requestId;

    expect(tonightId).not.toBe(eventsId);
    // Resolve out of order to prove the ids, not the arrival order, decide the target.
    bridge.resolveRequest(eventsId, { events: [] });
    bridge.resolveRequest(tonightId, { sunset: null });

    await expect(events).resolves.toEqual([]);
    await expect(tonight).resolves.toEqual({ sunset: null });
  });

  it('rejects a calendar request for an impossible observer', () => {
    const onError = jest.fn();
    const postMessage = jest.fn();
    const webViewRef = { current: { postMessage } } as unknown as RefObject<WebView | null>;
    const bridge = createStellariumBridge(webViewRef, { onError });
    bridge.setReady(true);

    bridge.computeEvents(new Date('2026-08-21T12:00:00.000Z'), 60, { latitudeDeg: 200, longitudeDeg: 0 }).catch(() => {});

    expect(onError).toHaveBeenCalledWith('Latitude must be between -90 and 90 degrees.');
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('rejects a calendar range longer than the almanac supports', () => {
    const onError = jest.fn();
    const postMessage = jest.fn();
    const webViewRef = { current: { postMessage } } as unknown as RefObject<WebView | null>;
    const bridge = createStellariumBridge(webViewRef, { onError });
    bridge.setReady(true);

    bridge.computeEvents(new Date('2026-08-21T12:00:00.000Z'), 5000, { latitudeDeg: 39.9, longitudeDeg: 116.41 }).catch(() => {});

    expect(onError).toHaveBeenCalledWith('Calendar range must span between 1 and 400 days.');
    expect(postMessage).not.toHaveBeenCalled();
  });
});
