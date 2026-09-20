/* eslint-disable max-lines-per-function, no-new-func */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Extract the search functions and tables from index.html to verify them against a real/mock engine
const sceneHtml = readFileSync(resolve(__dirname, '../../assets/stellar/index.html'), 'utf8');

function extractCodeBlock(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  if (start === -1)
    throw new Error(`Start marker "${startMarker}" not found`);
  const end = source.indexOf(endMarker, start);
  if (end === -1)
    throw new Error(`End marker "${endMarker}" not found`);
  return source.slice(start, end);
}

type SceneMessage = {
  type: string;
  object?: { id: string } | null;
  requestId?: number;
  message?: string;
  state?: { azimuthDeg: number; altitudeDeg: number; fovDeg: number };
};

type SceneStel = {
  core: { selection: { id: string } | null; observer: Record<string, number>; fov: number };
  getObj: jest.Mock;
  pointAndLock: jest.Mock;
  zoomTo: jest.Mock;
  lookAt: jest.Mock;
  convertFrame: jest.Mock;
  c2s: jest.Mock;
  s2c: jest.Mock;
  D2R: number;
  R2D: number;
  date2MJD: jest.Mock;
};

type ViewState = { gateOpen: boolean; lastAzimuthDeg: number | null; lastAltitudeDeg: number | null; lastFovDeg: number | null };

/** The scene helpers that read/write the view state, without the state itself. */
function viewHelperBlock() {
  return extractCodeBlock(sceneHtml, 'function openViewStateChannel()', 'function publishBearing(');
}

/** Evaluates the real forceRender against the same shared camera state as the scene. */
function createRealForceRender(stel: unknown, cameraState: { lockedToTarget: boolean }) {
  return new Function(
    'stel',
    'cameraState',
    `${extractCodeBlock(sceneHtml, 'function forceRender()', 'function setModuleFlag(')}
     return forceRender;`,
  )(stel, cameraState) as () => void;
}

/** Isolated builds may not carry the satellite helper; the harness only needs the symbol. */
function isOrbitDataUsableBlock() {
  return sceneHtml.includes('function isOrbitDataUsable(')
    ? extractCodeBlock(sceneHtml, 'function isOrbitDataUsable(', 'let satelliteEpochReference')
    : 'function isOrbitDataUsable() { return true; }';
}

function createSceneFocusHarness(options: { realForceRender?: boolean } = {}) {
  const messages: SceneMessage[] = [];
  const stel: SceneStel = {
    core: { selection: null, observer: {}, fov: Math.PI / 4 },
    getObj: jest.fn(() => null),
    pointAndLock: jest.fn(),
    zoomTo: jest.fn(),
    lookAt: jest.fn(),
    convertFrame: jest.fn(() => [0, 0, -1, 0]),
    c2s: jest.fn((vector: number[]) => vector),
    s2c: jest.fn((azimuth: number, altitude: number) => [azimuth, altitude, 1]),
    D2R: Math.PI / 180,
    R2D: 180 / Math.PI,
    date2MJD: jest.fn(() => 51544.5),
  };
  const cameraState = { lockedToTarget: false };
  const viewState: ViewState = { gateOpen: false, lastAzimuthDeg: null, lastAltitudeDeg: null, lastFovDeg: null };
  const findCelestialObject = jest.fn((id: string): { id: string } | null => ({ id }));
  const formatSelectedObject = jest.fn((object: { id: string }) => object);
  const reportError = jest.fn((message: unknown) => messages.push({ type: 'error', message: String(message) }));
  const forceRender = options.realForceRender ? createRealForceRender(stel, cameraState) : jest.fn();
  const executeBlock = extractCodeBlock(sceneHtml, 'function execute(message)', 'const STELLARIUM_COMMANDS');
  const scene = new Function(
    'stel',
    'send',
    'findCelestialObject',
    'formatSelectedObject',
    'determineObjectType',
    'isFiniteNumber',
    'forceRender',
    'reportError',
    'cameraState',
    'viewState',
    `let activeFocusToken = 0; let currentCancelToken = 0;
     ${isOrbitDataUsableBlock()}
     ${viewHelperBlock()}
     ${executeBlock}
     return { execute };`,
  )(
    stel,
    (message: SceneMessage) => messages.push(message),
    findCelestialObject,
    formatSelectedObject,
    () => ({ type: 'constellation' }),
    Number.isFinite,
    forceRender,
    reportError,
    cameraState,
    viewState,
  ) as {
    execute: (message: {
      type: string;
      name?: string;
      token?: number;
      requestId?: number;
      state?: unknown;
      isoTime?: string;
    }) => void;
  };
  return {
    execute: scene.execute,
    viewState,
    cameraState,
    messages,
    stel,
    forceRender,
    findCelestialObject,
  };
}

/** Evaluates the real bearing/view_state publisher against a mock engine. */
function createViewChannelHarness() {
  const messages: SceneMessage[] = [];
  const stel = {
    core: { fov: Math.PI / 4, observer: {} },
    D2R: Math.PI / 180,
    R2D: 180 / Math.PI,
    convertFrame: jest.fn(() => [0, 0, -1, 0]),
    c2s: jest.fn(() => [30 * Math.PI / 180, 10 * Math.PI / 180]),
    s2c: jest.fn((azimuth: number, altitude: number) => [azimuth, altitude, 1]),
    lookAt: jest.fn(),
    zoomTo: jest.fn(),
    pointAndLock: jest.fn(),
  };
  const cameraState = { lockedToTarget: false };
  const viewState: ViewState = { gateOpen: false, lastAzimuthDeg: null, lastAltitudeDeg: null, lastFovDeg: null };
  const scene = new Function(
    'stel',
    'send',
    'isFiniteNumber',
    'updateSatelliteVisibility',
    'cameraState',
    'viewState',
    `let lastAzimuthDeg = null;
     ${viewHelperBlock()}
     ${extractCodeBlock(sceneHtml, 'function publishBearing()', 'function reportError(')}
     return { publishBearing, centerOnObject };`,
  )(
    stel,
    (message: SceneMessage) => messages.push(message),
    Number.isFinite,
    () => {},
    cameraState,
    viewState,
  ) as {
    publishBearing: () => void;
    centerOnObject: (object: { id: string }, duration: number) => void;
  };
  return { ...scene, messages, stel, viewState, cameraState };
}

/** The gated channel reports pose only; view_bearing is a separate older signal. */
function viewStateMessages(messages: SceneMessage[]) {
  return messages.filter(message => message.type === 'view_state');
}

function createFontStartupHarness(failFont = false) {
  const frames: Array<() => void> = [];
  const messages: Array<{ type: string }> = [];
  const errors: unknown[] = [];
  const loadedFonts: string[] = [];
  let rendererReady = false;
  const engine = {
    core: Object.fromEntries(['stars', 'dsos', 'skycultures', 'milkyway', 'landscapes', 'satellites', 'comets', 'atmosphere', 'constellations'].map(key => [key, { addDataSource() {}, fog_visible: true, visible: true }])),
    D2R: Math.PI / 180,
    s2c() { return [1, 0, 0]; },
    lookAt() {},
    on() {},
    async setFont(kind: string) {
      if (!rendererReady)
        throw new Error('font registration before native renderer initialization');
      if (failFont)
        throw new Error('font asset unavailable');
      loadedFonts.push(kind);
    },
  };
  const startEngine = new Function(
    'StelWebEngine',
    'assetUrl',
    'document',
    'window',
    'requestAnimationFrame',
    'reportError',
    'send',
    `let stel; const NAMES_ZH = {}; const pendingCommands = [];
     const publishBearing = () => {}; const setInterval = () => {}; const handleSkyClick = () => {}; const execute = () => {};
     ${extractCodeBlock(sceneHtml, 'function startEngine()', '    })();')}
     return startEngine;`,
  )(
    (options: { onReady: (value: typeof engine) => void }) => {
      // The bundled SDK queues its render loop in afterInit, before onReady.
      frames.push(() => {
        rendererReady = true;
      });
      options.onReady(engine);
      return Promise.resolve(engine);
    },
    (path: string) => path,
    { getElementById: () => ({}) },
    { __STEL_LANG: 'zh' },
    (callback: () => void) => frames.push(callback),
    (error: unknown) => errors.push(error),
    (message: { type: string }) => messages.push(message),
  ) as () => void;
  return { startEngine, frames, messages, errors, loadedFonts, engine };
}

async function settleFontStartup() {
  for (let index = 0; index < 10; index++)
    await Promise.resolve();
}

describe('scene atmosphere defaults before the first frame', () => {
  it.each([
    ['atmosphere', 'visible'],
    ['landscapes', 'fog_visible'],
  ] as const)('disables %s.%s before restoring saved preferences', (module, flag) => {
    const harness = createFontStartupHarness();
    harness.startEngine();

    expect(harness.engine.core[module][flag]).toBe(false);
    expect(harness.engine.core.landscapes.visible).toBe(true);
  });
});

describe('native renderer font startup ordering', () => {
  it('waits for the first native frame and both fonts before publishing ready', async () => {
    const harness = createFontStartupHarness();
    harness.startEngine();
    await settleFontStartup();
    expect(harness.errors).toEqual([]);
    expect(harness.messages).toEqual([]);
    expect(harness.loadedFonts).toEqual([]);
    for (const frame of harness.frames.splice(0))
      frame();
    await settleFontStartup();
    expect(harness.loadedFonts).toEqual(['regular', 'bold']);
    expect(harness.messages).toEqual([{ type: 'ready' }]);
    expect(harness.errors).toEqual([]);
  });

  it('reports font failure without exposing a falsely ready scene', async () => {
    const harness = createFontStartupHarness(true);
    harness.startEngine();
    for (const frame of harness.frames.splice(0))
      frame();
    await settleFontStartup();
    expect(harness.messages).toEqual([]);
    expect(harness.errors).toHaveLength(1);
    expect(String(harness.errors[0])).toContain('font asset unavailable');
  });
});

describe('scene focus cancellation executes in one token space', () => {
  it('reads object details without moving or selecting a target', () => {
    const { execute, messages, stel } = createSceneFocusHarness();
    execute({ type: 'get_object_info', name: 'M 31', requestId: 1 });
    expect(messages[0]).toMatchObject({ type: 'object_info_result', object: { id: 'M 31' } });
    expect(stel.pointAndLock).not.toHaveBeenCalled();
    expect(stel.core.selection).toBeNull();
  });

  it('does not cancel the center animation with a forced lookAt', () => {
    const { execute, forceRender, stel } = createSceneFocusHarness();
    execute({ type: 'point_and_lock', name: 'M 31' });
    expect(stel.pointAndLock).toHaveBeenCalled();
    expect(forceRender).not.toHaveBeenCalled();
  });

  it('centers the object already selected in the scene without resolving it again by name', () => {
    // The RN overlay centers the object it received from object_selected, so the
    // engine selection already is that target. Re-resolving by name is slower and
    // can resolve to a different object (or miss) for catalog designations.
    const { execute, stel, findCelestialObject } = createSceneFocusHarness();
    const selected = { id: 'M 31' };
    stel.core.selection = selected;
    findCelestialObject.mockReturnValue(null);

    execute({ type: 'point_and_lock', name: 'M 31' });

    expect(findCelestialObject).not.toHaveBeenCalled();
    expect(stel.pointAndLock).toHaveBeenCalledWith(selected, 0.5);
    expect(stel.core.selection).toBe(selected);
  });

  it('centers the same selected object again without a lookup', () => {
    const { execute, stel, findCelestialObject } = createSceneFocusHarness();
    const selected = { id: 'NAME Mars' };
    stel.core.selection = selected;
    findCelestialObject.mockReturnValue(null);

    execute({ type: 'point_and_lock', name: 'NAME Mars' });
    execute({ type: 'point_and_lock', name: 'NAME Mars' });

    expect(findCelestialObject).not.toHaveBeenCalled();
    expect(stel.pointAndLock).toHaveBeenCalledTimes(2);
    expect(stel.pointAndLock).toHaveBeenLastCalledWith(selected, 0.5);
  });

  it('reports a target that cannot be resolved instead of pretending the center succeeded', () => {
    const { execute, stel, messages, findCelestialObject } = createSceneFocusHarness();
    findCelestialObject.mockReturnValue(null);

    execute({ type: 'point_and_lock', name: 'Nope 999' });

    expect(stel.pointAndLock).not.toHaveBeenCalled();
    expect(messages).toEqual([{ type: 'error', message: expect.stringContaining('Nope 999') }]);
  });

  it('keeps a centered object locked while the periodic set_time refresh runs', () => {
    // core_lookat(pos, 0) memsets core->target, dropping the pointAndLock
    // animation and the lock. The 1 Hz set_time tick used to run a refresh like
    // that, which is what cancelled the center the user was watching.
    const { execute, stel } = createSceneFocusHarness({ realForceRender: true });
    const Mars = { id: 'NAME Mars' };
    stel.core.selection = Mars;
    execute({ type: 'point_and_lock', name: 'NAME Mars' });
    expect(stel.pointAndLock).toHaveBeenCalledWith(Mars, 0.5);
    stel.lookAt.mockImplementation((_position: number[], duration: number) => {
      if (duration === 0)
        stel.core.selection = null;
    });

    for (let tick = 0; tick < 3; tick += 1)
      execute({ type: 'set_time', isoTime: '2000-01-01T12:00:00Z' });

    expect(stel.lookAt).not.toHaveBeenCalled();
    expect(stel.core.selection).toBe(Mars);
  });

  it('keeps a search focus locked across repeated time refreshes', () => {
    const { execute, stel } = createSceneFocusHarness({ realForceRender: true });
    execute({ type: 'focus_target', name: 'CON western Boo', token: 1, requestId: 1 });
    const focused = stel.core.selection;
    expect(focused).toEqual({ id: 'CON western Boo' });
    stel.lookAt.mockImplementation((_position: number[], duration: number) => {
      if (duration === 0)
        stel.core.selection = null;
    });

    for (let tick = 0; tick < 3; tick += 1)
      execute({ type: 'set_time', isoTime: '2000-01-01T12:00:00Z' });

    expect(stel.lookAt).not.toHaveBeenCalled();
    expect(stel.core.selection).toBe(focused);
  });

  it('keeps legacy focus working after a numbered cancellation', () => {
    const { execute, messages, stel } = createSceneFocusHarness();
    execute({ type: 'cancel_search', token: 100 });
    execute({ type: 'focus_target', name: 'CON western Boo', requestId: 1 });
    expect(stel.core.selection).toEqual({ id: 'CON western Boo' });
    expect(messages[0].object).toEqual({ id: 'CON western Boo' });
  });

  it('invalidates numbered focus when a legacy cancellation arrives', () => {
    const { execute, messages, stel } = createSceneFocusHarness();
    execute({ type: 'focus_target', name: 'CON western Boo', token: 100, requestId: 1 });
    execute({ type: 'cancel_search' });
    execute({ type: 'focus_target', name: 'CON western Leo', token: 100, requestId: 2 });
    expect(stel.core.selection).toEqual({ id: 'CON western Boo' });
    expect(messages[1].object).toBeNull();
  });

  it('does not let an older cancellation lower the rejection threshold', () => {
    const { execute, messages, stel } = createSceneFocusHarness();
    execute({ type: 'cancel_search', token: 8 });
    execute({ type: 'cancel_search', token: 2 });
    execute({ type: 'focus_target', name: 'CON western Leo', token: 5, requestId: 1 });
    expect(stel.core.selection).toBeNull();
    expect(messages[0].object).toBeNull();
  });

  it('rejects a focus superseded by a newer selection', () => {
    const { execute, messages, stel } = createSceneFocusHarness();
    execute({ type: 'focus_target', name: 'CON western Boo', token: 3, requestId: 1 });
    execute({ type: 'focus_target', name: 'CON western Leo', token: 1, requestId: 2 });
    expect(stel.core.selection).toEqual({ id: 'CON western Boo' });
    expect(messages[1].object).toBeNull();
  });

  it('accepts a new focus after cancellation without cancelling the lock animation', () => {
    const { execute, messages, stel } = createSceneFocusHarness();
    execute({ type: 'focus_target', name: 'CON western Boo', token: 1, requestId: 1 });
    execute({ type: 'cancel_search', token: 2 });
    execute({ type: 'focus_target', name: 'CON western Leo', token: 3, requestId: 2 });
    expect(stel.core.selection).toEqual({ id: 'CON western Leo' });
    expect(messages.map(message => message.object?.id)).toEqual(['CON western Boo', 'CON western Leo']);
    expect(stel.pointAndLock).toHaveBeenLastCalledWith({ id: 'CON western Leo' }, 0.6);
  });
});

describe('stellarium saved-view restore and view_state report', () => {
  it('keeps the view channel silent until the app delivers its restore decision', () => {
    // Publishing the default horizon view before restore_view would overwrite the
    // view archived by the app.
    const { publishBearing, messages } = createViewChannelHarness();
    publishBearing();
    expect(viewStateMessages(messages)).toEqual([]);
  });

  it('reports the real engine azimuth, altitude and fov once the channel is open', () => {
    const { publishBearing, centerOnObject, messages } = createViewChannelHarness();
    centerOnObject({ id: 'M 31' }, 0.5);
    publishBearing();
    publishBearing();
    const reports = viewStateMessages(messages);
    expect(reports).toHaveLength(1);
    expect(reports[0].state?.azimuthDeg).toBeCloseTo(30);
    expect(reports[0].state?.altitudeDeg).toBeCloseTo(10);
    expect(reports[0].state?.fovDeg).toBeCloseTo(45);
  });

  it('reports the view again only after it moves beyond the reporting tolerance', () => {
    const harness = createViewChannelHarness();
    harness.centerOnObject({ id: 'M 31' }, 0.5);
    harness.publishBearing();
    harness.stel.c2s.mockReturnValue([30.4 * Math.PI / 180, 10.2 * Math.PI / 180]);
    harness.publishBearing();
    const reports = viewStateMessages(harness.messages);
    expect(reports).toHaveLength(2);
    expect(reports[1].state?.azimuthDeg).toBeCloseTo(30.4);
  });

  it('reports the engine fov above 180 degrees without clamping it', () => {
    // The live Android core reports core.fov * R2D = 182.28 for the current view,
    // so an archived view must survive the round trip unchanged.
    const harness = createViewChannelHarness();
    harness.stel.core.fov = 182.28 * Math.PI / 180;
    harness.centerOnObject({ id: 'M 31' }, 0.5);
    harness.publishBearing();
    expect(viewStateMessages(harness.messages)[0].state?.fovDeg).toBeCloseTo(182.28);
  });

  it('applies a valid restore without touching time, location or any other engine state', () => {
    const { execute, stel, messages } = createSceneFocusHarness();
    stel.core.observer = { utc: 51544.5, latitude: 0.7, longitude: 1.2 };

    execute({ type: 'restore_view', state: { azimuthDeg: 123.45, altitudeDeg: -20.5, fovDeg: 45 } });

    expect(stel.lookAt).toHaveBeenCalledWith([123.45 * stel.D2R, -20.5 * stel.D2R, 1], 0);
    expect(stel.zoomTo).toHaveBeenCalledWith(45 * stel.D2R, 0);
    expect(stel.core.observer).toEqual({ utc: 51544.5, latitude: 0.7, longitude: 1.2 });
    expect(messages).toEqual([]);
  });

  it('restores the wide fov range that zoom_to accepts, including values above 180 degrees', () => {
    const { execute, stel, messages } = createSceneFocusHarness();
    execute({ type: 'restore_view', state: { azimuthDeg: 10, altitudeDeg: 10, fovDeg: 182.28 } });
    expect(stel.lookAt).toHaveBeenCalledWith([10 * stel.D2R, 10 * stel.D2R, 1], 0);
    expect(stel.zoomTo).toHaveBeenCalledWith(182.28 * stel.D2R, 0);
    expect(messages).toEqual([]);
  });

  it('opens the report channel after applying the saved view', () => {
    const { execute, viewState } = createSceneFocusHarness();
    expect(viewState.gateOpen).toBe(false);
    execute({ type: 'restore_view', state: { azimuthDeg: 10, altitudeDeg: 10, fovDeg: 45 } });
    expect(viewState.gateOpen).toBe(true);
  });

  it('treats a null restore as "nothing archived" and only opens the channel', () => {
    const { execute, stel, viewState, messages } = createSceneFocusHarness();
    execute({ type: 'restore_view', state: null });
    expect(stel.lookAt).not.toHaveBeenCalled();
    expect(stel.zoomTo).not.toHaveBeenCalled();
    expect(viewState.gateOpen).toBe(true);
    expect(messages).toEqual([]);
  });

  it('clears a stale target lock when the app restores a saved view', () => {
    const { execute, stel, cameraState } = createSceneFocusHarness();
    stel.core.selection = { id: 'M 31' };
    execute({ type: 'point_and_lock', name: 'M 31' });
    expect(cameraState.lockedToTarget).toBe(true);

    execute({ type: 'restore_view', state: { azimuthDeg: 10, altitudeDeg: 10, fovDeg: 45 } });

    expect(cameraState.lockedToTarget).toBe(false);
    expect(stel.lookAt).toHaveBeenCalledWith([10 * stel.D2R, 10 * stel.D2R, 1], 0);
  });

  it.each([
    ['an azimuth of exactly 360', { azimuthDeg: 360, altitudeDeg: 10, fovDeg: 45 }],
    ['a negative azimuth', { azimuthDeg: -1, altitudeDeg: 10, fovDeg: 45 }],
    ['an altitude above the zenith', { azimuthDeg: 10, altitudeDeg: 91, fovDeg: 45 }],
    ['an altitude below the horizon', { azimuthDeg: 10, altitudeDeg: -91, fovDeg: 45 }],
    ['a zero field of view', { azimuthDeg: 10, altitudeDeg: 10, fovDeg: 0 }],
    ['a field of view above the 360 degree zoom ceiling', { azimuthDeg: 10, altitudeDeg: 10, fovDeg: 360.5 }],
    ['a non-finite value', { azimuthDeg: Number.NaN, altitudeDeg: 10, fovDeg: 45 }],
  ])('rejects %s instead of moving the camera', (_label, state) => {
    const { execute, stel, viewState, messages } = createSceneFocusHarness();
    execute({ type: 'restore_view', state });
    expect(stel.lookAt).not.toHaveBeenCalled();
    expect(stel.zoomTo).not.toHaveBeenCalled();
    expect(viewState.gateOpen).toBe(false);
    expect(messages).toEqual([{ type: 'error', message: 'Invalid view state.' }]);
  });
});

describe('stellarium engine search and lookup parsing in scene script', () => {
  let findCelestialObject: (target: string) => any;
  let determineObjectType: (cleanName: string, id: string, obj?: any) => { type: string; typeZh: string };
  let registerSearchCatalog: (items: unknown[]) => void;
  let getTargetUnavailableReason: (target: string) => string;
  let mockStel: any;

  beforeEach(() => {
    mockStel = {
      core: {
        skycultures: { current_id: 'western' },
        selection: null,
      },
      getObj: jest.fn((name: string) => {
        if (name === 'NAME Mars' || name === 'M 31' || name === 'NGC 7000' || name === 'IC 434' || name === 'HP 11767' || name === 'CON western Ori' || name === 'CON western Aql') {
          return { id: name, designations: () => [name] };
        }
        return null;
      }),
    };

    // Evaluate the extracted functions in a controlled context
    const synonymsBlock = extractCodeBlock(sceneHtml, 'const COMMON_SYNONYMS = {', 'let lastAzimuthDeg = null;');
    const constellationsBlock = extractCodeBlock(sceneHtml, 'const WESTERN_CONSTELLATIONS_MAP = {', 'const overlayCanvas = document.getElementById');
    const determineTypeBlock = extractCodeBlock(sceneHtml, 'function determineObjectType(', 'function computeHourAngle(');
    const findObjBlock = extractCodeBlock(sceneHtml, 'function findCelestialObject(', '// Sky-culture data sources load asynchronously');

    const fnBuilder = new Function(
      'stel',
      'NAMES_ZH',
      'REVERSE_NAMES_ZH',
      `
      ${synonymsBlock}
      ${constellationsBlock}
      ${determineTypeBlock}
      ${findObjBlock}
      return { findCelestialObject, determineObjectType, COMMON_SYNONYMS,
        registerSearchCatalog: typeof registerSearchCatalog === 'function' ? registerSearchCatalog : () => {},
        getTargetUnavailableReason: typeof getTargetUnavailableReason === 'function' ? getTargetUnavailableReason : () => 'not_found' };
    `,
    );

    const namesZh: Record<string, string> = {
      Mars: '火星',
      Orion: '猎户座',
    };
    const reverseNamesZh: Record<string, string> = {
      火星: 'Mars',
    };

    const ctx = fnBuilder(mockStel, namesZh, reverseNamesZh);
    findCelestialObject = ctx.findCelestialObject;
    determineObjectType = ctx.determineObjectType;
    registerSearchCatalog = ctx.registerSearchCatalog;
    getTargetUnavailableReason = ctx.getTargetUnavailableReason;
  });

  it('distinguishes asynchronous loading, exhausted bundled data, and unknown input', () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      registerSearchCatalog([{ id: 'M 40', nameEn: 'Winnecke 4', nameZh: '梅西耶40', category: 'dso' }]);
      expect(getTargetUnavailableReason('M 40')).toBe('loading');
      expect(getTargetUnavailableReason('unknown target')).toBe('not_found');
      clock.mockReturnValue(9001);
      expect(getTargetUnavailableReason('M 40')).toBe('missing_data');
      mockStel.core.skycultures.current_id = 'chinese';
      expect(getTargetUnavailableReason('CON western Ori')).toBe('culture_mismatch');
    }
    finally { clock.mockRestore(); }
  });

  it.each(['Megrez', '天权', 'HIP59774', 'hip 59774', 'tianquan'])(
    'resolves registered alias %s through the verified native Bayer designation',
    (query) => {
      // The shipped WASM resolves * del UMa, but NOT Megrez or HP/HIP 59774.
      mockStel.getObj.mockImplementation((id: string) => id === '* del UMa' ? { id } : null);
      registerSearchCatalog([{ id: 'Megrez', nameEn: 'Megrez', nameZh: '天权', category: 'stars', aliases: ['HIP59774', 'tianquan'], engineIds: ['* del UMa'] }]);
      expect(findCelestialObject(query)?.id).toBe('* del UMa');
    },
  );

  it('does not use a registered constellation alias to bypass the sky culture guard', () => {
    registerSearchCatalog([{ id: 'CON western Ori', nameEn: 'Orion', nameZh: '猎户座', category: 'constellation', aliases: ['liehu'] }]);
    mockStel.core.skycultures.current_id = 'chinese';
    expect(findCelestialObject('liehu')).toBeNull();
    expect(mockStel.core.skycultures.current_id).toBe('chinese');
  });

  it('replaces registration instead of retaining aliases from an old catalog', () => {
    registerSearchCatalog([{ id: 'M 31', nameEn: 'Andromeda', nameZh: '仙女星系', aliases: ['old-alias'] }]);
    expect(findCelestialObject('old-alias')?.id).toBe('M 31');
    registerSearchCatalog([]);
    expect(findCelestialObject('old-alias')).toBeNull();
  });

  it('resolves Chinese planetary and celestial synonyms to engine objects', () => {
    const mars = findCelestialObject('火星');
    expect(mars).not.toBeNull();
    expect(mockStel.getObj).toHaveBeenCalledWith('NAME Mars');
  });

  it('normalizes Messier, NGC, IC, and HIP identifiers to engine standards', () => {
    findCelestialObject('m31');
    expect(mockStel.getObj).toHaveBeenCalledWith('M 31');

    findCelestialObject('ngc 7000');
    expect(mockStel.getObj).toHaveBeenCalledWith('NGC 7000');

    findCelestialObject('ic434');
    expect(mockStel.getObj).toHaveBeenCalledWith('IC 434');

    findCelestialObject('hip 11767');
    expect(mockStel.getObj).toHaveBeenCalledWith('HP 11767');
  });

  it('resolves English Galaxy names to their corresponding catalog designations', () => {
    findCelestialObject('Andromeda Galaxy');
    expect(mockStel.getObj).toHaveBeenCalledWith('M 31');
  });

  it('does NOT create synthetic objects when dictionary entries are unsupported by engine getObj', () => {
    // If an object is not supported by stel.getObj, findCelestialObject must return null
    const result = findCelestialObject('NonExistentCluster');
    expect(result).toBeNull();
  });

  it('finds western constellations when current sky culture is western', () => {
    mockStel.core.skycultures.current_id = 'western';
    const orion = findCelestialObject('猎户座');
    expect(orion).not.toBeNull();
    expect(mockStel.getObj).toHaveBeenCalledWith('CON western Ori');

    const aql = findCelestialObject('Aquila');
    expect(aql).not.toBeNull();
    expect(mockStel.getObj).toHaveBeenCalledWith('CON western Aql');
  });

  it('returns null and does NOT switch sky culture when current sky culture is not western', () => {
    mockStel.core.skycultures.current_id = 'chinese';
    const result = findCelestialObject('猎户座');
    expect(result).toBeNull();
    // Sky culture must remain unchanged
    expect(mockStel.core.skycultures.current_id).toBe('chinese');

    const result2 = findCelestialObject('CON western Ori');
    expect(result2).toBeNull();
    expect(mockStel.core.skycultures.current_id).toBe('chinese');
  });

  it('classifies object types accurately for adaptive FOV calculation', () => {
    expect(determineObjectType('Mars', 'NAME Mars').type).toBe('planet');
    expect(determineObjectType('Moon', 'NAME Moon').type).toBe('moon');
    expect(determineObjectType('M 31', 'M 31').type).toBe('dso');
    expect(determineObjectType('Ori', 'CON western Ori').type).toBe('constellation');
    expect(determineObjectType('Vega', 'Vega').type).toBe('star');
  });

  it.each([
    { id: 'NAME Andromeda Galaxy', model: 'dso', types: ['G'], expected: 'dso' },
    { id: 'NAME Io', model: 'jpl_sso', types: ['Moo'], expected: 'moon' },
    { id: 'NAME ISS', model: 'tle_satellite', types: ['Asa'], expected: 'satellite' },
    { id: 'NAME 1P/Halley', model: 'mpc_comet', types: ['Com'], expected: 'comet' },
  ])('classifies native $id using its real model rather than a nonexistent type property', ({ id, model, types, expected }) => {
    expect(determineObjectType(String(id).replace('NAME ', ''), String(id), { jsonData: { model, types } }).type).toBe(expected);
  });
});

function createGeometryHarness() {
  const stel = {
    R2D: 180 / Math.PI,
    core: { observer: { utc: 51544.5, tt: 51544.501, longitude: 0 } },
    c2s: (v: number[]) => [v[0], v[1]],
    convertFrame: (_obs: unknown, _from: string, dest: string) => dest === 'CIRS' ? [0.6, 0.4, 1] : [-0.5, 0.7, 1],
  };
  const code = [
    extractCodeBlock(sceneHtml, 'const COMMON_SYNONYMS = {', 'let lastAzimuthDeg = null;'),
    extractCodeBlock(sceneHtml, 'const WESTERN_CONSTELLATIONS_MAP = {', 'const overlayCanvas = document.getElementById'),
    extractCodeBlock(sceneHtml, 'function determineObjectType(', 'function findCelestialObject('),
    extractCodeBlock(sceneHtml, 'function formatSelectedObject(', 'function handleSkyClick()'),
  ].join('\n');
  return new Function('stel', 'NAMES_ZH', 'isFiniteNumber', `${code}; return { formatSelectedObject, registerSearchCatalog, isOrbitDataUsable: typeof isOrbitDataUsable === 'function' ? isOrbitDataUsable : () => true };`)(stel, {}, Number.isFinite);
}

describe('native scene observation data contract', () => {
  it('rejects expired and malformed TLE data rather than offering fictional satellite positions', () => {
    const { isOrbitDataUsable } = createGeometryHarness();
    const satellite = (epoch: string) => ({ jsonData: { model: 'tle_satellite', model_data: { tle: [epoch] } } });
    expect(isOrbitDataUsable(satellite('1 25544U 98067A   00001.50000000'))).toBe(true);
    expect(isOrbitDataUsable(satellite('1 25544U 98067A   20029.69572272'))).toBe(false);
    expect(isOrbitDataUsable(satellite('broken'))).toBe(false);
    expect(isOrbitDataUsable({ jsonData: { model: 'star' } })).toBe(true);
  });

  it('sets a UTC command through the UTC observer field, not the TT field', () => {
    const observer = { utc: -1, tt: -1 };
    const block = extractCodeBlock(sceneHtml, 'function execute(message)', 'const STELLARIUM_COMMANDS');
    const execute = new Function('stel', 'forceRender', 'reportError', `${block}; return execute;`)(
      { core: { observer }, date2MJD: () => 51544.5 },
      jest.fn(),
      jest.fn(),
    );
    execute({ type: 'set_time', isoTime: '2000-01-01T12:00:00Z' });
    expect(observer.utc).toBe(51544.5);
    expect(observer.tt).toBe(-1);
  });

  it('keeps unknown coordinates null instead of inventing zero RA and declination', () => {
    const { formatSelectedObject } = createGeometryHarness();
    expect(formatSelectedObject({ id: 'Unknown', getInfo: () => undefined })).toMatchObject({
      raHours: null,
      decDeg: null,
      raJ2000Hours: null,
      decJ2000Deg: null,
      hourAngleHours: null,
    });
  });

  it('separates CIRS coordinates from ICRF/J2000 and reads native angular dimensions', () => {
    const { formatSelectedObject, registerSearchCatalog } = createGeometryHarness();
    registerSearchCatalog([{ id: 'M 31', nameEn: 'Andromeda Galaxy', nameZh: '仙女星系', aliases: ['NAME Andromeda Galaxy'] }]);
    const result = formatSelectedObject({
      id: 'NAME Andromeda Galaxy',
      designations: () => ['NAME Andromeda Galaxy', 'M 31'],
      jsonData: { model: 'dso', model_data: { dimx: 177.8 } },
      getInfo: (key: string) => key === 'radec' ? [0.3, 0.2, 1] : undefined,
    });
    expect(result.raHours).toBeCloseTo(0.6 * 180 / Math.PI / 15);
    expect(result.raJ2000Hours).toBeCloseTo(0.3 * 180 / Math.PI / 15);
    expect(result.decDeg).toBeCloseTo(0.4 * 180 / Math.PI);
    expect(result.sizeArcsec).toBeCloseTo(177.8 * 60);
    expect(result).toMatchObject({ catalogId: 'M 31', name: '仙女星系', englishName: 'Andromeda Galaxy', type: 'dso' });
  });

  it('converts the native angular radius in radians to a diameter in arcseconds', () => {
    const { formatSelectedObject } = createGeometryHarness();
    const getInfo = jest.fn((key: string) => key === 'radius' ? 0.00001 : undefined);
    expect(formatSelectedObject({ id: 'NAME Mars', getInfo }).sizeArcsec).toBeCloseTo(0.00002 * 180 / Math.PI * 3600);
    expect(getInfo).not.toHaveBeenCalledWith('size');
    expect(getInfo).not.toHaveBeenCalledWith('apparent_size');
  });
});
