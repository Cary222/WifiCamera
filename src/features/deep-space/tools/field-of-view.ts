export type FieldOfViewInput = {
  focalLengthMm: number;
  multiplier: number;
  sensorHeightMm: number;
  sensorWidthMm: number;
};

export type FieldOfView = {
  diagonalDeg: number;
  effectiveFocalLengthMm: number;
  horizontalDeg: number;
  verticalDeg: number;
};

export type ViewportSize = { height: number; width: number };
export type SensorSize = { heightMm: number; widthMm: number };
export type FrameLayout = { height: number; width: number; x: number; y: number };

const FRAME_MAX_FRACTION = 0.82;

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function angleDegrees(sensorSizeMm: number, focalLengthMm: number): number {
  return 2 * Math.atan(sensorSizeMm / (2 * focalLengthMm)) * 180 / Math.PI;
}

export function calculateFieldOfView(input: FieldOfViewInput): FieldOfView | null {
  const { focalLengthMm, multiplier, sensorHeightMm, sensorWidthMm } = input;
  if (![focalLengthMm, multiplier, sensorHeightMm, sensorWidthMm].every(isPositiveFinite))
    return null;

  const effectiveFocalLengthMm = focalLengthMm * multiplier;
  const diagonalMm = Math.hypot(sensorWidthMm, sensorHeightMm);
  return {
    diagonalDeg: angleDegrees(diagonalMm, effectiveFocalLengthMm),
    effectiveFocalLengthMm,
    horizontalDeg: angleDegrees(sensorWidthMm, effectiveFocalLengthMm),
    verticalDeg: angleDegrees(sensorHeightMm, effectiveFocalLengthMm),
  };
}

export function formatAngularSize(degrees: number): string {
  if (!Number.isFinite(degrees) || degrees < 0)
    return '--';
  return degrees < 1 ? `${(degrees * 60).toFixed(1)}′` : `${degrees.toFixed(2)}°`;
}

export function createFrameLayout(viewport: ViewportSize, sensor: SensorSize): FrameLayout {
  if (![viewport.width, viewport.height, sensor.widthMm, sensor.heightMm].every(isPositiveFinite))
    return { height: 0, width: 0, x: 0, y: 0 };

  const maxWidth = viewport.width * FRAME_MAX_FRACTION;
  const maxHeight = viewport.height * FRAME_MAX_FRACTION;
  const sensorAspect = sensor.widthMm / sensor.heightMm;
  const width = Math.min(maxWidth, maxHeight * sensorAspect);
  const height = width / sensorAspect;
  return {
    height,
    width,
    x: (viewport.width - width) / 2,
    y: (viewport.height - height) / 2,
  };
}

export function getMapVerticalFov(sensorVerticalFovDeg: number, frame: FrameLayout, viewportHeight: number): number | null {
  if (!isPositiveFinite(sensorVerticalFovDeg) || !isPositiveFinite(frame.height) || !isPositiveFinite(viewportHeight))
    return null;
  const mapFov = sensorVerticalFovDeg / (frame.height / viewportHeight);
  return mapFov > 0 && mapFov <= 360 ? mapFov : null;
}
