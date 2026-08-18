import { getPreviewSurfaceHeight } from './preview-layout';

const WIDTH = 1080;
const TALL_SCREEN = 2376;

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

  it('never exceeds the available screen height', () => {
    const shortScreen = 900;
    expect(getPreviewSurfaceHeight('4:3', WIDTH, shortScreen)).toBe(shortScreen);
    expect(getPreviewSurfaceHeight('full', WIDTH, shortScreen)).toBe(shortScreen);
  });
});
