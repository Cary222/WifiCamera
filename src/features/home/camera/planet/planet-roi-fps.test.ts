import { SHUTTER_VALUES } from '../shutter-values';
import { createCustomRoiPreset } from './preview-layout';
import { PLANET_ROI_PRESETS } from './use-planet-capture';

describe('pLANET_ROI_PRESETS', () => {
  it('only provides 3 distinct hardware crop presets without duplicates', () => {
    expect(PLANET_ROI_PRESETS).toHaveLength(3);
    const keys = PLANET_ROI_PRESETS.map(p => p.key);
    expect(keys).toEqual(['full', 'medium', 'deep']);

    const resolutions = PLANET_ROI_PRESETS.map(p => p.label);
    expect(resolutions).toEqual(['1920×1080', '800×600', '640×480']);
  });

  it('assigns descriptive keys for each preset', () => {
    expect(PLANET_ROI_PRESETS[0].descriptionKey).toBe('planet.roi_full_desc');
    expect(PLANET_ROI_PRESETS[1].descriptionKey).toBe('planet.roi_medium_desc');
    expect(PLANET_ROI_PRESETS[2].descriptionKey).toBe('planet.roi_deep_desc');
  });

  it('creates custom ROI presets with hardware alignment and centering', () => {
    // 1280x720 is already aligned (1280%16=0, 720%8=0)
    const custom720 = createCustomRoiPreset(1280, 720);
    expect(custom720.width).toBe(1280);
    expect(custom720.height).toBe(720);
    expect(custom720.x).toBe(320); // 320 % 2 === 0
    expect(custom720.y).toBe(180); // 180 % 4 === 0 (IMX662 driver constraint)
    expect(custom720.label).toBe('1280×720');

    // Unaligned inputs (e.g. 505 x 303) automatically align to 16 and 8 multiples
    const unaligned = createCustomRoiPreset(505, 303);
    expect(unaligned.width % 16).toBe(0); // 512
    expect(unaligned.height % 8).toBe(0); // 304
    expect(unaligned.x + unaligned.width).toBeLessThanOrEqual(1920);
    expect(unaligned.y + unaligned.height).toBeLessThanOrEqual(1080);
  });

  it('supports long exposures up to 60s in planet mode', () => {
    expect(SHUTTER_VALUES[SHUTTER_VALUES.length - 1]).toBe(60);
    expect(SHUTTER_VALUES).toContain(1);
    expect(SHUTTER_VALUES).toContain(5);
    expect(SHUTTER_VALUES).toContain(10);
    expect(SHUTTER_VALUES).toContain(30);
    expect(SHUTTER_VALUES).toContain(60);
  });
});
