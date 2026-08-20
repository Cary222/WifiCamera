import {
  getEffectiveSensorRoi,
  getPreviewSurfaceHeight,
  getPreviewSurfaceHeightForRoi,
  getSensorRoiCommandParams,
  isNativeSensorAspectRatio,
} from './preview-layout';

const WIDTH = 1080;
const TALL_SCREEN = 2376;

describe('getEffectiveSensorRoi', () => {
  const fullHd = { x: 0, y: 0, width: 1920, height: 1080 };

  it('center-crops a 1920×1080 preset to a real 4:3 sensor window', () => {
    expect(getEffectiveSensorRoi(fullHd, '4:3')).toEqual({
      x: 240,
      y: 0,
      width: 1440,
      height: 1080,
    });
  });

  it('center-crops a 4:3 preset to a hardware-aligned 16:9 sensor window', () => {
    expect(getEffectiveSensorRoi({ x: 560, y: 240, width: 800, height: 600 }, '16:9')).toEqual({
      x: 576,
      y: 320,
      width: 768,
      height: 432,
    });
  });

  it('keeps exact-ratio presets unchanged and preserves full mode', () => {
    const deep = { x: 640, y: 300, width: 640, height: 480 };

    expect(getEffectiveSensorRoi(deep, '4:3')).toEqual(deep);
    expect(getEffectiveSensorRoi(deep, 'full')).toEqual(deep);
    expect(getEffectiveSensorRoi(fullHd, '16:9')).toEqual(fullHd);
  });

  it('keeps cropped coordinates and dimensions even and inside the preset', () => {
    const source = { x: 640, y: 300, width: 640, height: 480 };
    const result = getEffectiveSensorRoi(source, '16:9');

    expect(result).toEqual({ x: 640, y: 360, width: 640, height: 360 });
    expect(result.x % 16).toBe(0);
    expect(result.y % 8).toBe(0);
    expect(result.width % 16).toBe(0);
    expect(result.height % 8).toBe(0);
    expect(result.x + result.width).toBeLessThanOrEqual(source.x + source.width);
    expect(result.y + result.height).toBeLessThanOrEqual(source.y + source.height);
  });

  it('builds set_sensor_roi parameters from the effective output window', () => {
    const roi = getEffectiveSensorRoi(fullHd, '4:3');
    expect(getSensorRoiCommandParams(roi)).toEqual([240, 0, 1440, 1080, 0]);
  });

  it('only marks the board-provided 1920×1080 ROI as native 16:9', () => {
    expect(isNativeSensorAspectRatio(fullHd, '16:9')).toBe(true);
    expect(isNativeSensorAspectRatio({ x: 560, y: 240, width: 800, height: 600 }, '16:9')).toBe(false);
    expect(isNativeSensorAspectRatio({ x: 640, y: 300, width: 640, height: 480 }, '4:3')).toBe(true);
  });
});

describe('getPreviewSurfaceHeight', () => {
  it('fills the 16:9 viewport in full frame', () => {
    expect(getPreviewSurfaceHeight('full', WIDTH, TALL_SCREEN)).toBe(WIDTH / 0.5625);
  });

  it('crops to the selected ratio so switching is visible', () => {
    const fourThree = getPreviewSurfaceHeight('4:3', WIDTH, TALL_SCREEN);
    const sixteenNine = getPreviewSurfaceHeight('16:9', WIDTH, TALL_SCREEN);

    expect(fourThree).toBe(WIDTH / 0.75);
    expect(sixteenNine).toBe(WIDTH / 0.5625);
    // The bug this guards: every ratio returning the same height, which made
    // the card look interactive while the preview never changed.
    expect(fourThree).not.toBe(sixteenNine);
  });

  it('uses the effective sensor ROI ratio for the actual preview surface', () => {
    expect(getPreviewSurfaceHeightForRoi(
      { width: 800, height: 450 },
      WIDTH,
      TALL_SCREEN,
    )).toBe(WIDTH * 800 / 450);
    expect(getPreviewSurfaceHeightForRoi(
      { width: 800, height: 600 },
      WIDTH,
      TALL_SCREEN,
    )).toBe(WIDTH * 800 / 600);
  });

  it('never exceeds the available screen height', () => {
    const shortScreen = 900;
    expect(getPreviewSurfaceHeight('4:3', WIDTH, shortScreen)).toBe(shortScreen);
    expect(getPreviewSurfaceHeight('full', WIDTH, shortScreen)).toBe(shortScreen);
    expect(getPreviewSurfaceHeightForRoi(
      { width: 640, height: 480 },
      WIDTH,
      shortScreen,
    )).toBe(shortScreen);
  });
});
