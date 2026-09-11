import type { RefObject } from 'react';
import type { WebView } from 'react-native-webview';
import type { StellariumViewState } from './stellarium-service';

import { createStellariumBridge, parseStellariumViewState } from './stellarium-service';

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

describe('stellarium catalog contract', () => {
  it('requests fresh object details without sending any focus or selection command', async () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);
    const promise = (bridge as any).getObjectInfo?.('M 31');
    expect(postMessage.mock.calls.map(([data]) => JSON.parse(data).type)).toEqual(['get_object_info']);
    const { requestId } = JSON.parse(postMessage.mock.calls[0][0]);
    bridge.resolveRequest(requestId, { id: 'NAME Andromeda Galaxy', altDeg: 23 });
    await expect(promise).resolves.toMatchObject({ id: 'NAME Andromeda Galaxy', altDeg: 23 });
  });

  it('queues catalog registration before subsequent queries', () => {
    const { bridge, postMessage } = createBridgeHarness();
    const items = [{ id: 'Megrez', nameEn: 'Megrez', nameZh: '天权', category: 'stars', engineIds: ['* del UMa'] }];
    (bridge as any).setSearchCatalog?.(items);
    expect(postMessage).not.toHaveBeenCalled();
    bridge.setReady(true);
    expect(JSON.parse(postMessage.mock.calls[0]?.[0] || '{}')).toEqual({ type: 'set_search_catalog', items });
  });

  it('preserves engine canonical identifiers and explicit lookup reasons', async () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);
    const promise = bridge.queryTargets(['Megrez', 'M 40']);
    const { requestId } = JSON.parse(postMessage.mock.calls[0][0]);
    bridge.resolveRequest(requestId, [
      { id: 'Megrez', available: true, canonicalId: '* del UMa', reason: 'available' },
      { id: 'M 40', available: false, reason: 'missing_data' },
    ]);
    await expect(promise).resolves.toEqual([
      { id: 'Megrez', available: true, canonicalId: '* del UMa', reason: 'available' },
      { id: 'M 40', available: false, reason: 'missing_data' },
    ]);
  });
});

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

  it('posts searchTarget legacy command for backwards compatibility', () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);

    bridge.searchTarget('Vega');

    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'search_target', name: 'Vega' }));
  });
});

describe('stellarium target query bridge', () => {
  it('immediately rejects invalid query targets input without waiting for timeout', async () => {
    const { bridge } = createBridgeHarness();
    bridge.setReady(true);

    // Not an array
    await expect((bridge as any).queryTargets(null)).rejects.toThrow('queryTargets requires an array of target names.');
    // More than 100 items
    const tooMany = Array.from({ length: 101 }, (_, i) => `target_${i}`);
    await expect(bridge.queryTargets(tooMany)).rejects.toThrow('queryTargets accepts at most 100 names.');
    // Invalid item in array
    await expect(bridge.queryTargets(['   '])).rejects.toThrow('Each target name must be a non-empty string.');
  });

  it('posts query_targets with request id and resolves with finite fields', async () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);

    const promise = bridge.queryTargets(['M 31', '织女星', 'UnknownObject']);
    const sent = JSON.parse(postMessage.mock.calls[0][0] as string);

    expect(sent).toMatchObject({
      type: 'query_targets',
      names: ['M 31', '织女星', 'UnknownObject'],
    });
    expect(typeof sent.requestId).toBe('number');

    bridge.resolveRequest(sent.requestId, [
      { id: 'M 31', available: true, altDeg: 45.2, azDeg: 180.1, vmag: 3.44 },
      { id: '织女星', available: true, altDeg: 80.5, azDeg: 90.0, vmag: 0.03 },
      { id: 'UnknownObject', available: false },
    ]);

    const result = await promise;
    expect(result).toEqual([
      { id: 'M 31', available: true, altDeg: 45.2, azDeg: 180.1, vmag: 3.44 },
      { id: '织女星', available: true, altDeg: 80.5, azDeg: 90.0, vmag: 0.03 },
      { id: 'UnknownObject', available: false },
    ]);
  });
});

describe('stellarium focus target and cancel bridge', () => {
  it('immediately rejects invalid focus target name or fov', async () => {
    const { bridge } = createBridgeHarness();
    bridge.setReady(true);

    await expect(bridge.focusTarget('')).rejects.toThrow('Target name must be a non-empty string.');
    await expect(bridge.focusTarget('   ')).rejects.toThrow('Target name must be a non-empty string.');
    await expect(bridge.focusTarget('Mars', -5)).rejects.toThrow('FOV must be greater than 0 and no more than 360 degrees.');
    await expect(bridge.focusTarget('Mars', 400)).rejects.toThrow('FOV must be greater than 0 and no more than 360 degrees.');
  });

  it('posts focus_target with request id and token, and resolves correlated object', async () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);

    const promise = bridge.focusTarget('Mars', 2);
    const sent = JSON.parse(postMessage.mock.calls[0][0] as string);

    expect(sent).toMatchObject({
      type: 'focus_target',
      name: 'Mars',
      fovDeg: 2,
    });
    expect(typeof sent.requestId).toBe('number');
    expect(typeof sent.token).toBe('number');

    const fakeObj = {
      id: 'NAME Mars',
      name: '火星',
      englishName: 'Mars',
      type: 'planet',
      typeZh: '行星',
      raHours: 5.5,
      decDeg: 24.2,
      designations: ['NAME Mars'],
    };

    bridge.resolveRequest(sent.requestId, fakeObj);
    const result = await promise;
    expect(result).toEqual(fakeObj);
  });

  it('resolves null when focus target is not found', async () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);

    const promise = bridge.focusTarget('NonExistentBody');
    const sent = JSON.parse(postMessage.mock.calls[0][0] as string);

    bridge.resolveRequest(sent.requestId, null);
    const result = await promise;
    expect(result).toBeNull();
  });
});

describe('stellarium focus cancellation', () => {
  it('cancelSearch invalidates active focus token so outdated results return null without affecting map', async () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);

    const promise = bridge.focusTarget('Mars');
    const sent = JSON.parse(postMessage.mock.calls[0][0] as string);

    bridge.cancelSearch();

    // cancel_search must carry the bumped token so the WebView stays inside the
    // same incrementing token space (Date.now() would break all future focus).
    const cancelCall = postMessage.mock.calls.find(([raw]) => JSON.parse(raw as string).type === 'cancel_search');
    expect(cancelCall).toBeDefined();
    const cancelMessage = JSON.parse(cancelCall![0] as string);
    expect(cancelMessage).toEqual({ type: 'cancel_search', token: sent.token + 1 });

    // Late correlated response arrives after cancel
    bridge.resolveRequest(sent.requestId, {
      id: 'NAME Mars',
      name: '火星',
      englishName: 'Mars',
      type: 'planet',
      typeZh: '行星',
      raHours: 5.5,
      decDeg: 24.2,
      designations: ['NAME Mars'],
    });

    const result = await promise;
    expect(result).toBeNull();
  });

  it('keeps focusTarget working after a previous cancelSearch (token space regression)', async () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);

    const firstFocus = bridge.focusTarget('Mars');
    const firstSent = JSON.parse(postMessage.mock.calls[0][0] as string);
    bridge.cancelSearch();
    bridge.resolveRequest(firstSent.requestId, null);
    await expect(firstFocus).resolves.toBeNull();

    const secondFocus = bridge.focusTarget('CON western Boo');
    const secondSent = JSON.parse(postMessage.mock.calls[2][0] as string);
    expect(secondSent.type).toBe('focus_target');
    expect(secondSent.token).toBeGreaterThan(1);

    bridge.resolveRequest(secondSent.requestId, {
      id: 'CON western Boo',
      name: '牧夫座',
      englishName: 'Boötes',
      type: 'constellation',
      typeZh: '星座',
      raHours: 14.7,
      decDeg: 30,
      designations: ['CON western Boo'],
    });

    const result = await secondFocus;
    expect(result).not.toBeNull();
    expect(result?.id).toBe('CON western Boo');
  });

  it('cleans up pending request timers and rejects pending promises on reload', async () => {
    const { bridge } = createBridgeHarness();
    bridge.setReady(true);

    const pendingQuery = bridge.queryTargets(['Mars']);
    const pendingFocus = bridge.focusTarget('Jupiter');

    bridge.reload();

    await expect(pendingQuery).rejects.toThrow('Stellarium bridge reloaded.');
    await expect(pendingFocus).rejects.toThrow('Stellarium bridge reloaded.');
  });
});

describe('stellarium request lifecycle', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('settles cancelled focus immediately and never sends it when ready arrives', async () => {
    const { bridge, postMessage } = createBridgeHarness();
    const outcome = bridge.focusTarget('CON western Boo').then(
      value => ({ value }),
      error => ({ error: String(error) }),
    );
    bridge.cancelSearch();
    const remainingTimers = jest.getTimerCount();
    await jest.runAllTimersAsync();
    bridge.setReady(true);
    expect(await outcome).toEqual({ value: null });
    expect(remainingTimers).toBe(0);
    expect(postMessage.mock.calls.map(([raw]) => JSON.parse(raw).type)).toEqual(['cancel_search']);
  });

  it('settles a superseded focus while leaving the new one active', async () => {
    const { bridge } = createBridgeHarness();
    const first = bridge.focusTarget('NAME Mars').then(value => ({ value }), error => ({ error }));
    const second = bridge.focusTarget('CON western Boo');
    bridge.resolveRequest(2, { id: 'CON western Boo' });
    await jest.runAllTimersAsync();
    expect(await first).toEqual({ value: null });
    await expect(second).resolves.toMatchObject({ id: 'CON western Boo' });
  });

  it('rejects invalid calendar requests without leaving a timeout behind', async () => {
    const { bridge, postMessage } = createBridgeHarness();
    const outcome = bridge.computeEvents(new Date('2026-09-09T00:00:00Z'), 5000, {
      latitudeDeg: 39.9,
      longitudeDeg: 116.41,
    }).catch(error => error.message);
    const remainingTimers = jest.getTimerCount();
    await jest.runAllTimersAsync();
    expect(await outcome).toBe('Calendar range must span between 1 and 400 days.');
    expect(remainingTimers).toBe(0);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('does not replay expired requests after the engine becomes ready', async () => {
    const { bridge, postMessage } = createBridgeHarness();
    const pending = bridge.queryTargets(['NAME Sun']).catch(error => error.message);
    await jest.advanceTimersByTimeAsync(20_000);
    expect(await pending).toBe('Stellarium calculation timed out.');
    bridge.setReady(true);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('clears queued commands from the old document on reload', async () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.gotoRaDec(120, 25);
    const pending = bridge.focusTarget('NAME Mars').catch(error => error.message);
    bridge.reload();
    expect(await pending).toBe('Stellarium bridge reloaded.');
    bridge.setReady(true);
    expect(postMessage).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
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

describe('stellarium view-state contract', () => {
  const SAVED_VIEW: StellariumViewState = { altitudeDeg: -20.5, azimuthDeg: 123.45, fovDeg: 45 };

  it('posts the archived view to the scene after the engine is ready', () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);

    bridge.restoreView(SAVED_VIEW);

    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'restore_view', state: SAVED_VIEW }));
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it('posts a null view to open the reporting channel without moving the view', () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);

    bridge.restoreView(null);

    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'restore_view', state: null }));
  });

  it('queues the archived view until the engine reports ready', () => {
    const { bridge, postMessage } = createBridgeHarness();

    bridge.restoreView(SAVED_VIEW);
    expect(postMessage).not.toHaveBeenCalled();

    bridge.setReady(true);
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'restore_view', state: SAVED_VIEW }));
  });

  it('accepts the documented boundary values, including the wide engine fov over 180', () => {
    const { bridge, postMessage } = createBridgeHarness();
    bridge.setReady(true);

    bridge.restoreView({ altitudeDeg: -90, azimuthDeg: 0, fovDeg: 360 });
    bridge.restoreView({ altitudeDeg: 90, azimuthDeg: 359.999, fovDeg: 0.001 });
    bridge.restoreView({ altitudeDeg: 0, azimuthDeg: 271.25, fovDeg: 182.28 });

    expect(postMessage).toHaveBeenCalledTimes(3);
    expect(postMessage).toHaveBeenLastCalledWith(JSON.stringify({
      type: 'restore_view',
      state: { altitudeDeg: 0, azimuthDeg: 271.25, fovDeg: 182.28 },
    }));
  });

  it.each([
    ['an azimuth of exactly 360', { altitudeDeg: 10, azimuthDeg: 360, fovDeg: 45 }],
    ['a negative azimuth', { altitudeDeg: 10, azimuthDeg: -1, fovDeg: 45 }],
    ['an altitude above the zenith', { altitudeDeg: 91, azimuthDeg: 10, fovDeg: 45 }],
    ['an altitude below the horizon', { altitudeDeg: -91, azimuthDeg: 10, fovDeg: 45 }],
    ['a zero field of view', { altitudeDeg: 10, azimuthDeg: 10, fovDeg: 0 }],
    ['a field of view above 360', { altitudeDeg: 10, azimuthDeg: 10, fovDeg: 360.5 }],
    ['a non-finite value', { altitudeDeg: Number.NaN, azimuthDeg: 10, fovDeg: 45 }],
    ['an infinite value', { altitudeDeg: 10, azimuthDeg: Number.POSITIVE_INFINITY, fovDeg: 45 }],
    ['a missing field', { azimuthDeg: 10, altitudeDeg: 10 }],
    ['a stringified field', { altitudeDeg: 10, azimuthDeg: '10', fovDeg: 45 }],
  ])('rejects %s without touching the scene', (_label, state) => {
    const onError = jest.fn();
    const postMessage = jest.fn();
    const webViewRef = { current: { postMessage } } as unknown as RefObject<WebView | null>;
    const bridge = createStellariumBridge(webViewRef, { onError });
    bridge.setReady(true);

    bridge.restoreView(state as unknown as StellariumViewState);

    expect(onError).toHaveBeenCalledWith('Invalid view state.');
    expect(postMessage).not.toHaveBeenCalled();
  });
});

describe('parseStellariumViewState', () => {
  it('accepts a finite in-range report and strips unknown fields', () => {
    expect(parseStellariumViewState({ altitudeDeg: 12.5, azimuthDeg: 271.2, fovDeg: 30.5, extra: 'ignored' })).toEqual({
      altitudeDeg: 12.5,
      azimuthDeg: 271.2,
      fovDeg: 30.5,
    });
  });

  it.each([
    ['a non-object report', 'restore_view'],
    ['a null report', null],
    ['a report with an out-of-range azimuth', { altitudeDeg: 10, azimuthDeg: 360, fovDeg: 45 }],
    ['a report with an out-of-range altitude', { altitudeDeg: -120, azimuthDeg: 10, fovDeg: 45 }],
    ['a report with an out-of-range field of view', { altitudeDeg: 10, azimuthDeg: 10, fovDeg: 400 }],
    ['a report with a non-finite field', { altitudeDeg: 10, azimuthDeg: 10, fovDeg: Number.NaN }],
    ['a report missing a field', { altitudeDeg: 10, azimuthDeg: 10 }],
  ])('returns null for %s', (_label, report) => {
    expect(parseStellariumViewState(report)).toBeNull();
  });
});
