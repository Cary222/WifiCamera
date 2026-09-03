export type CompassHeading = {
  magHeading: number;
  trueHeading: number;
};

/** Selects the calibrated true-north reading when Android provides one. */
export function resolveCompassHeading({ magHeading, trueHeading }: CompassHeading): number {
  const heading = trueHeading >= 0 ? trueHeading : magHeading;
  if (heading >= 0 && heading < 360)
    return heading;
  return ((heading % 360) + 360) % 360;
}
