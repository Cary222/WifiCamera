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
  it('loads the bundled Guéreins landscape before signaling ready', () => {
    const landscapeSource = sceneHtml.indexOf('core.landscapes.addDataSource({ url: assetUrl(\'data/landscapes/guereins\'), key: \'guereins\' })');
    const readySignal = sceneHtml.indexOf('send({ type: \'ready\' })');

    expect(landscapeSource).toBeGreaterThan(-1);
    expect(landscapeSource).toBeLessThan(readySignal);
    expect(sceneHtml).toContain('core.atmosphere.visible = true;');
    expect(sceneHtml).toContain('core.landscapes.visible = true;');
    expect(sceneHtml).toContain('core.constellations.images_visible = true;');
    expect(sceneHtml).toContain('const horizonDirection = stel.s2c(0, 20 * stel.D2R);');
    expect(sceneHtml).toContain('stel.lookAt(horizonDirection, 0);');
    expect(sceneHtml).toContain('case \'set_sky_layers\':');
    expect(sceneHtml).toContain('setModuleFlag(stel.core.landscapes, \'visible\', message.landscape);');
    expect(sceneHtml).toContain('setModuleFlag(stel.core.constellations, \'labels_visible\', message.constellationLabels);');
    expect(sceneHtml).toContain('setModuleFlag(stel.core.constellations, \'bounds_visible\', message.constellationBoundaries);');
    expect(sceneHtml).toContain('setModuleFlag(stel.core.constellations, \'show_only_pointed\', message.constellationOnlyPointed);');
    // An unsupported optional flag must not abort the remaining layers in the same batch.
    expect(sceneHtml).toContain('try { module[key] = value; } catch {}');
  });

  it('publishes the live view bearing so the compass can follow the engine', () => {
    expect(sceneHtml).toContain('const forward = stel.convertFrame(stel.core.observer, \'VIEW\', \'OBSERVED\', [0, 0, -1, 0]);');
    expect(sceneHtml).toContain('const azimuthDeg = (stel.c2s(forward)[0] * stel.R2D % 360 + 360) % 360;');
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
    expect(sceneHtml).toContain('window.__STEL_LANG = window.__STEL_LANG || \'en\';');
  });

  it('loads a TrueType CJK subset that the bundled renderer can safely parse', () => {
    expect(sceneHtml).toContain('const uiFont = window.__STEL_LANG === \'zh\' ? \'fonts/NotoSansSC-Subset.ttf\' : \'fonts/Roboto-Regular.ttf\';');
    expect(sfntTableTags(cjkFont)).toContain('glyf');
    expect(sfntTableTags(cjkFont)).not.toContain('CFF ');
    expect(sceneHtml).toContain('void stel.setFont(\'regular\', assetUrl(uiFont)).catch(reportError);');
    expect(sceneHtml).toContain('void stel.setFont(\'bold\', assetUrl(uiFontBold)).catch(reportError);');
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
    expect(sceneHtml).toContain('stel.pointAndLock(object, 0.5);');
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
    expect(sceneHtml).toContain('setModuleFlag(stel.core.landscapes, \'fog_visible\', message.fog);');
    expect(sceneHtml).toContain('setModuleFlag(stel.core.cardinals, \'visible\', message.cardinals);');
    expect(sceneHtml).toContain('setModuleFlag(stel.core.atmosphere, \'turbidity\', message.turbidity);');
    expect(sceneHtml).toContain('stel.core.landscapes.current.color = message.landscapeTint;');
  });

  it('supports the drawer feature commands against real engine state', () => {
    expect(sceneHtml).toContain('case \'set_time\':');
    expect(sceneHtml).toContain('stel.core.observer.tt = stel.date2MJD(date);');
    expect(sceneHtml).toContain('case \'set_grid_lines\':');
    expect(sceneHtml).toContain('stel.getModule(`core.lines.$' + '{line}`)');
    expect(sceneHtml).toContain('case \'set_location\':');
    expect(sceneHtml).toContain('stel.core.observer.latitude = message.latitudeDeg * stel.D2R;');
    expect(sceneHtml).toContain('stel.core.observer.longitude = message.longitudeDeg * stel.D2R;');
  });
});
