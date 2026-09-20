import type { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sceneHtml = readFileSync(resolve(__dirname, '../../assets/stellar/index.html'), 'utf8');
const cjkFont = readFileSync(resolve(__dirname, '../../assets/stellar/fonts/NotoSansSC-Subset.ttf'));
const namesZh = JSON.parse(readFileSync(resolve(__dirname, '../../assets/stellar/names-zh.json'), 'utf8')) as Record<string, string>;

function sfntTableTags(font: Buffer): string[] {
  const tableCount = font.readUInt16BE(4);
  return Array.from({ length: tableCount }, (_, index) => font.subarray(12 + index * 16, 16 + index * 16).toString('ascii'));
}
const skyCultures = JSON.parse(readFileSync(resolve(__dirname, '../../assets/stellar/skycultures-full.json'), 'utf8')) as { cultures: { id: string; highlight?: string }[] };

describe('stellarium default scene', () => {
  it('registers orbital files with the format keys required by the native modules', () => {
    expect(sceneHtml).toContain('assetUrl(\'data/tle_satellite.jsonl.gz\'), key: \'jsonl/sat\'');
    expect(sceneHtml).toContain('assetUrl(\'data/CometEls.txt\'), key: \'mpc_comets\'');
  });
  it('loads the bundled Guéreins landscape before signaling ready', () => {
    const landscapeSource = sceneHtml.indexOf('core.landscapes.addDataSource({ url: assetUrl(\'data/landscapes/guereins\'), key: \'guereins\' })');
    const readySignal = sceneHtml.indexOf('send({ type: \'ready\' })');

    expect(landscapeSource).toBeGreaterThan(-1);
    expect(landscapeSource).toBeLessThan(readySignal);
    expect(sceneHtml).toContain('core.landscapes.visible = true;');
    expect(sceneHtml).toContain('core.constellations.images_visible = true;');
    expect(sceneHtml).toContain('const horizonDirection = stel.s2c(0, 20 * stel.D2R);');
    expect(sceneHtml).toContain('stel.lookAt(horizonDirection, 0);');
    expect(sceneHtml).toContain('case \'set_sky_layers\':');
    expect(sceneHtml).toContain('setModuleFlag(stel.core.landscapes, \'visible\', message.landscape);');
    expect(sceneHtml).toContain('setModuleFlag(stel.core.constellations, \'labels_visible\', message.constellationLabels);');
    expect(sceneHtml).toContain('setModuleFlag(stel.core.constellations, \'bounds_visible\', message.constellationBoundaries);');
    expect(sceneHtml).toContain('setModuleFlag(stel.core.constellations, \'show_only_pointed\', message.constellationOnlyPointed);');
    expect(sceneHtml).toContain('setModuleFlag(stel.core.planets, \'hints_visible\', message.planetLabels);');
    expect(sceneHtml).toContain('setModuleFlag(stel.core.stars, \'hints_visible\', message.starLabels);');
    expect(sceneHtml).toContain('setModuleFlag(stel.core.dsos, \'hints_visible\', message.dsoLabels);');
    expect(sceneHtml).toContain('setModuleFlag(stel.core.satellites, \'hints_visible\', message.satelliteLabels);');
    expect(sceneHtml).toContain('setModuleFlag(stel.core.stars, \'hints_mag_offset\', message.starHintsOffset);');
    expect(sceneHtml).toContain('setModuleFlag(stel.core.planets, \'hints_mag_offset\', message.planetHintsOffset);');
    expect(sceneHtml).toContain('setModuleFlag(stel.core.dsos, \'hints_mag_offset\', message.dsoHintsOffset);');
    expect(sceneHtml).toContain('setModuleFlag(stel.core.satellites, \'hints_mag_offset\', message.satelliteHintsOffset);');
    // An unsupported optional flag must not abort the remaining layers in the
    // same batch, but the failure is reported instead of silently swallowed —
    // a dropped assignment used to be indistinguishable from a working one.
    expect(sceneHtml).toContain('try { module[key] = value; } catch (e) { reportError(\'Failed to set \' + key + \': \' + e); }');
  });
});

describe('stellarium advanced settings', () => {
  it('resolves the magnitude limit through a single decision point', () => {
    // The user's explicit limit and the Bortle-derived estimate both target
    // `display_limit_mag`. Writing it directly let whichever ran last win, so
    // any environment change silently wiped the user's setting.
    expect(sceneHtml).toContain('const magnitudeState = { userLimit: null, bortleLimit: 99 };');
    expect(sceneHtml).toContain('const value = magnitudeState.userLimit ?? magnitudeState.bortleLimit;');
    expect(sceneHtml).toContain('magnitudeState.userLimit = message.magnitude >= 99 ? null : message.magnitude;');
    expect(sceneHtml).toContain('magnitudeState.bortleLimit = nelmMappings[b - 1] ?? 99;');
    // Exactly one writer may touch the engine property.
    expect(sceneHtml.match(/setModuleFlag\(stel\.core, 'display_limit_mag'/g)).toHaveLength(1);
  });

  it('modulates native exposure scale and star point-spread scale for brightness', () => {
    // Instead of CSS filter/opacity which washes out the true-black sky background
    // and fades out the canvas on mobile GPUs, brightness modulates the native
    // Stellarium Web engine exposure_scale and star_linear_scale directly.
    expect(sceneHtml).toContain('setModuleFlag(stel.core, \'exposure_scale\', b);');
    expect(sceneHtml).toContain('setModuleFlag(stel.core, \'star_linear_scale\', Math.max(0.05, Math.min(2.5, b * 0.4)));');
    expect(sceneHtml).not.toContain('document.getElementById(\'canvas\')');
  });

  it('publishes the live view bearing so the compass can follow the engine', () => {
    expect(sceneHtml).toContain('const forward = stel.convertFrame(stel.core.observer, \'VIEW\', \'OBSERVED\', [0, 0, -1, 0]);');
    expect(sceneHtml).toContain('const spherical = stel.c2s(forward);');
    expect(sceneHtml).toContain('const azimuthDeg = (spherical[0] * stel.R2D % 360 + 360) % 360;');
    expect(sceneHtml).toContain('send({ type: \'view_bearing\', azimuthDeg });');
    expect(sceneHtml).toContain('setInterval(publishBearing, 250)');
  });

  it('ships the real Stellarium Chinese names for every western constellation', () => {
    expect(namesZh.Orion).toBe('猎户座');
    expect(namesZh['Ursa Major']).toBe('大熊座');
    expect(namesZh.Betelgeuse).toBe('参宿四');
    expect(Object.keys(namesZh).length).toBeGreaterThan(3000);
  });

  it('translates engine labels through the language the app injects', () => {
    expect(sceneHtml).toContain('translateFn: (domain, str) => (window.__STEL_LANG === \'zh\' ? NAMES_ZH[str] ?? str : str),');
    expect(sceneHtml).toContain('let NAMES_ZH = {};');
    expect(sceneHtml).toContain('fetch(assetUrl(\'names-zh.json\'))');
    // The merged scene resolves the language from the injected global first, then
    // the `?lang=` query parameter used by the web host, and finally falls back to English.
    expect(sceneHtml).toContain('window.__STEL_LANG = window.__STEL_LANG || (new URLSearchParams(window.location.search).get(\'lang\')) || \'en\';');
  });

  it('loads a TrueType CJK subset that the bundled renderer can safely parse', () => {
    expect(sceneHtml).toContain('const uiFont = window.__STEL_LANG === \'zh\' ? \'fonts/NotoSansSC-Subset.ttf\' : \'fonts/Roboto-Regular.ttf\';');
    expect(sfntTableTags(cjkFont)).toContain('glyf');
    expect(sfntTableTags(cjkFont)).not.toContain('CFF ');
    expect(sceneHtml).toContain('stel.setFont(\'regular\', assetUrl(uiFont))');
    expect(sceneHtml).toContain('stel.setFont(\'bold\', assetUrl(uiFontBold))');
  });

  it('computes the calendar in the scene because the bundled wasm drops calendar_*', () => {
    expect(sceneHtml).toContain('case \'compute_tonight\':');
    expect(sceneHtml).toContain('case \'compute_events\':');
    expect(sceneHtml).toContain('send({ type: \'tonight\', requestId: message.requestId, payload });');
    expect(sceneHtml).toContain('send({ type: \'events\', requestId: message.requestId, payload });');
    // Altitude is the basis of every rise/set answer, so keep the exact conversion pinned.
    expect(sceneHtml).toContain('return stel.c2s(horizontal)[1] * stel.R2D;');
    expect(sceneHtml).toContain('const SUNSET_ALT = -0.833;');
    expect(sceneHtml).toContain('const NIGHT_ALT = -18;');
  });

  it('always restores the live observer after sampling other times', () => {
    // Sampling mutates the shared observer; a missing restore would rewrite the user's sky.
    const withObserver = sceneHtml.slice(sceneHtml.indexOf('function withObserver'), sceneHtml.indexOf('function altitudeAt'));
    expect(withObserver).toContain('} finally {');
    expect(withObserver).toContain('observer.tt = tt;');
    expect(withObserver).toContain('observer.latitude = latitude;');
    expect(withObserver).toContain('observer.longitude = longitude;');
  });

  it('loads the meteor shower almanac before the engine starts', () => {
    expect(sceneHtml).toContain('fetch(assetUrl(\'data/meteor-showers.json\'))');
    expect(sceneHtml).toContain('METEOR_SHOWERS = meteors.showers ?? [];');
  });

  it('keeps one representative target for every generated sky culture', () => {
    expect(skyCultures.cultures).toHaveLength(33);
    expect(skyCultures.cultures.every(culture => Boolean(culture.highlight))).toBe(true);
    expect(skyCultures.cultures.find(culture => culture.id === 'chinese')?.highlight).toBe('CON chinese 236');
    expect(skyCultures.cultures.find(culture => culture.id === 'western')?.highlight).toBe('CON western Aql');
  });

  it('waits for an asynchronously loaded sky culture before focusing its featured constellation', () => {
    expect(sceneHtml).toContain('function focusSkyCultureTarget(target, retries = 80)');
    expect(sceneHtml).toContain('setTimeout(() => focusSkyCultureTarget(target, retries - 1), 50)');
    expect(sceneHtml).toContain('centerOnObject(object, 0.5);');
    expect(sceneHtml).toContain('if (message.target) focusSkyCultureTarget(message.target);');
  });
});

describe('stellarium scene commands and overlays', () => {
  it('projects custom grid overlays with the engine core field of view', () => {
    // Runtime inspection shows fov belongs to core, not observer. Reading observer.fov
    // produces NaN coordinates and leaves the overlay canvas completely transparent.
    expect(sceneHtml).toContain('const fovRad = stel.core.fov;');
    expect(sceneHtml).not.toContain('const fovRad = obs.fov;');
  });

  it('lazily registers a landscape data source before switching to it', () => {
    // The engine keeps one module per landscape key; re-adding a source leaks memory,
    // so the scene must remember which keys it already registered.
    expect(sceneHtml).toContain('const loadedLandscapes = new Set([\'guereins\']);');
    expect(sceneHtml).toContain('case \'set_landscape\': {');
    expect(sceneHtml).toContain('if (!loadedLandscapes.has(message.id)) {');
    expect(sceneHtml).toContain('stel.core.landscapes.addDataSource({ url: assetUrl(`data/landscapes/$' + '{message.id}`), key: message.id });');
    expect(sceneHtml).toContain('stel.core.landscapes.current_id = message.id;');
  });

  it('treats the zero horizon as hiding the landscape instead of loading tiles', () => {
    // data/landscapes/zero ships no properties or tiles, so it cannot be a HiPS source.
    expect(sceneHtml).toContain('if (message.id === \'none\') {');
    expect(sceneHtml).toContain('setModuleFlag(stel.core.landscapes, \'visible\', false);');
  });

  it('exposes the environment knobs the engine actually implements', () => {
    // Verified at runtime: fog_visible, cardinals.visible, atmosphere.turbidity and
    // landscape color are writable; rotation/brightness/opacity do not exist.
    expect(sceneHtml).toContain('case \'set_environment\':');
    expect(sceneHtml).toContain('setModuleFlag(stel.core, \'bortle_index\', b);');
    expect(sceneHtml).toContain('setModuleFlag(stel.core.landscapes, \'fog_visible\', message.fog);');
    expect(sceneHtml).toContain('setModuleFlag(stel.core.cardinals, \'visible\', message.cardinals);');
    expect(sceneHtml).toContain('setModuleFlag(stel.core.atmosphere, \'turbidity\', message.turbidity);');
    expect(sceneHtml).toContain('stel.core.landscapes.current.color = message.landscapeTint;');
  });

  it('supports the drawer feature commands against real engine state', () => {
    expect(sceneHtml).toContain('case \'set_time\':');
    expect(sceneHtml.includes('stel.core.observer.utc = stel.date2MJD(date);')).toBe(true);
    expect(sceneHtml).toContain('case \'set_grid_lines\':');
    expect(sceneHtml).toContain('stel.getModule(`core.lines.$' + '{line}`)');
    expect(sceneHtml).toContain('case \'set_location\':');
    expect(sceneHtml).toContain('stel.core.observer.latitude = message.latitudeDeg * stel.D2R;');
    expect(sceneHtml).toContain('stel.core.observer.longitude = message.longitudeDeg * stel.D2R;');
  });

  it('registers canvas click listener to notify React Native of object selections', () => {
    expect(sceneHtml).toContain('stel.on(\'click\', handleSkyClick);');
    expect(sceneHtml).toContain('send({ type: \'object_selected\', object: payload });');
    expect(sceneHtml).toContain('send({ type: \'selection_cleared\' });');
  });

  it('supports clearing selection and point_and_lock commands', () => {
    expect(sceneHtml).toContain('case \'clear_selection\':');
    expect(sceneHtml).toContain('stel.core.selection = null;');
    expect(sceneHtml).toContain('case \'point_and_lock\':');
    expect(sceneHtml).toContain('centerOnObject(targetObj, 0.5);');
  });

  it('supports searching celestial targets with bilingual lookup and selection notification', () => {
    expect(sceneHtml).toContain('case \'search_target\':');
    expect(sceneHtml).toContain('const object = findCelestialObject(message.name);');
    expect(sceneHtml).toContain('const payload = formatSelectedObject(object);');
    expect(sceneHtml).toContain('if (payload) send({ type: \'object_selected\', object: payload });');
    expect(sceneHtml).toContain('send({ type: \'target_found\' });');
  });

  it('supports querying targets without mutating selection, time, location or fov', () => {
    expect(sceneHtml).toContain('case \'query_targets\':');
    expect(sceneHtml).toContain('send({ type: \'query_targets_result\', requestId: message.requestId, targets });');
  });

  it('supports correlated focus_target with 0.6s lock and adaptive fov without cancelling animation', () => {
    expect(sceneHtml).toContain('case \'focus_target\':');
    expect(sceneHtml).toContain('centerOnObject(object, 0.6);');
    expect(sceneHtml).toContain('send({ type: \'focus_target_result\', requestId: message.requestId, object: payload });');
    // Ensure focus_target does NOT dispatch legacy object_selected or target_found to avoid crosstalk
    const focusTargetBlock = sceneHtml.slice(sceneHtml.indexOf('case \'focus_target\':'), sceneHtml.indexOf('case \'cancel_search\':'));
    expect(focusTargetBlock).not.toContain('send({ type: \'target_found\' })');
    expect(focusTargetBlock).not.toContain('send({ type: \'object_selected\'');
    // Ensure it does not forceRender after pointAndLock which would cancel animation
    expect(focusTargetBlock).not.toContain('forceRender()');
  });

  it('supports cancel_search command and does not switch sky cultures automatically', () => {
    expect(sceneHtml).toContain('case \'cancel_search\':');
    // cancel_search must reuse the RN-issued token; Date.now() would exceed every
    // future focus token and permanently break focus_target after the first cancel.
    const cancelBlock = sceneHtml.slice(sceneHtml.indexOf('case \'cancel_search\':'));
    expect(cancelBlock).not.toContain('Date.now()');
    expect(cancelBlock).toContain('message.token');
  });

  it('loads bundled satellites and comets via real addDataSource API', () => {
    expect(sceneHtml.includes('core.satellites.addDataSource({ url: assetUrl(\'data/tle_satellite.jsonl.gz\'), key: \'jsonl/sat\' })')).toBe(true);
    expect(sceneHtml.includes('core.comets.addDataSource({ url: assetUrl(\'data/CometEls.txt\'), key: \'mpc_comets\' })')).toBe(true);
  });
});

describe('stellarium camera target and saved-view contract', () => {
  it('keeps the camera target out of refreshes and restores archived views strictly', () => {
    // The bundled core memsets core->target inside core_lookat(pos, 0), so a
    // refresh that ran while the user was centering an object cancelled both the
    // animation and the lock. Refreshes must stay away from the camera; the
    // engine's own render loop repaints the changed layers.
    expect(sceneHtml).toContain('const cameraState = { lockedToTarget: false };');
    expect(sceneHtml).toContain('if (!stel || cameraState.lockedToTarget) return;');
    expect(sceneHtml).toContain('case \'restore_view\':');
    expect(sceneHtml).toContain('return reportError(\'Invalid view state.\');');
    expect(sceneHtml).toContain('stel.lookAt(stel.s2c(azimuthDeg * stel.D2R, altitudeDeg * stel.D2R), 0);');
    expect(sceneHtml).toContain('stel.zoomTo(fovDeg * stel.D2R, 0);');
    expect(sceneHtml).toContain('send({ type: \'view_state\', state: { azimuthDeg, altitudeDeg, fovDeg } });');
    expect(sceneHtml).toContain('if (!viewState.gateOpen || !stel) return;');
  });
});
