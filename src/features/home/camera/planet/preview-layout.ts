export type AspectRatio = '4:3' | '16:9' | 'full';

/**
 * Height of the planet preview surface for the selected framing. Full frame
 * fills the 16:9 viewport; the other ratios crop it so the change is visible.
 */
export function getPreviewSurfaceHeight(
  aspectRatio: AspectRatio,
  width: number,
  height: number,
): number {
  const fullHeight = Math.min(height, width / 0.5625);
  if (aspectRatio === 'full')
    return fullHeight;
  const ratioValue = aspectRatio === '4:3' ? 0.75 : 0.5625;
  return Math.min(fullHeight, width / ratioValue);
}
