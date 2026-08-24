import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sceneHtml = readFileSync(resolve(__dirname, '../../assets/stellar/index.html'), 'utf8');
const namesZh = JSON.parse(readFileSync(resolve(__dirname, '../../assets/stellar/names-zh.json'), 'utf8')) as Record<string, string>;
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
    expect(sceneHtml).toContain('stel.core.landscapes.visible = message.landscape;');
    expect(sceneHtml).toContain('stel.core.constellations.labels_visible = message.constellationLabels;');
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

  it('loads the bundled CJK subset so Chinese labels render as glyphs', () => {
    expect(sceneHtml).toContain('const uiFont = window.__STEL_LANG === \'zh\' ? \'fonts/NotoSansSC-Subset.ttf\' : \'fonts/Roboto-Regular.ttf\';');
    expect(sceneHtml).toContain('stel.setFont(\'regular\', assetUrl(uiFont), 1.38);');
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
