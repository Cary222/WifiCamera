export type AspectRatio = '4:3' | '16:9' | 'full';

export type SensorRoi = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const TARGET_RATIOS = {
  '4:3': { width: 4, height: 3 },
  '16:9': { width: 16, height: 9 },
} as const;

const ROI_RATIO_SCALE_ALIGNMENT = 8;

/**
 * Applies the selected output ratio to the current hardware ROI. The crop is
 * centred inside the preset. Scaling the ratio pair by a multiple of 8 keeps
 * widths aligned to 16 pixels and heights aligned to 8 pixels for both 4:3 and
 * 16:9, matching the hardware ROI constraints observed by the app.
 */
export function getEffectiveSensorRoi(roi: SensorRoi, aspectRatio: AspectRatio): SensorRoi {
  if (aspectRatio === 'full')
    return { ...roi };

  const target = TARGET_RATIOS[aspectRatio];
  if (roi.width * target.height === roi.height * target.width
    && roi.width % 16 === 0
    && roi.height % 8 === 0) {
    return { ...roi };
  }

  const maximumScale = Math.floor(Math.min(roi.width / target.width, roi.height / target.height));
  const scale = Math.floor(maximumScale / ROI_RATIO_SCALE_ALIGNMENT) * ROI_RATIO_SCALE_ALIGNMENT;
  if (scale <= 0)
    return { ...roi };

  const width = target.width * scale;
  const height = target.height * scale;
  const centeredX = roi.x + (roi.width - width) / 2;
  const centeredY = roi.y + (roi.height - height) / 2;
  const maximumX = roi.x + roi.width - width;
  const maximumY = roi.y + roi.height - height;
  const x = Math.min(maximumX, Math.max(roi.x, Math.floor(centeredX / 16) * 16));
  const y = Math.min(maximumY, Math.max(roi.y, Math.floor(centeredY / 8) * 8));
  return {
    x,
    y,
    width,
    height,
  };
}

export function isNativeSensorAspectRatio(roi: SensorRoi, aspectRatio: AspectRatio): boolean {
  if (aspectRatio === 'full')
    return true;
  const target = TARGET_RATIOS[aspectRatio];
  return roi.width * target.height === roi.height * target.width;
}

export function getSensorRoiCommandParams(roi: SensorRoi): [number, number, number, number, number] {
  return [roi.x, roi.y, roi.width, roi.height, 0];
}

export function getPreviewSurfaceHeightForRoi(
  roi: Pick<SensorRoi, 'width' | 'height'>,
  width: number,
  height: number,
): number {
  return Math.min(height, width * roi.width / roi.height);
}

/**
 * Legacy ratio-only helper retained for callers/tests that do not own a sensor
 * ROI. Planet capture uses getPreviewSurfaceHeightForRoi so preview and output
 * are driven by the same effective window.
 */
export function getPreviewSurfaceHeight(
  aspectRatio: AspectRatio,
  width: number,
  height: number,
): number {
  const ratio = aspectRatio === '4:3'
    ? { width: 4, height: 3 }
    : { width: 16, height: 9 };
  return getPreviewSurfaceHeightForRoi(ratio, width, height);
}
