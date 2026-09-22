import { formatShutter, SHUTTER_VALUES } from './shutter-values';

export type EvLinkageResult = {
  exposure: number;
  gain: number;
  formattedExposure: string;
  formattedGain: string;
  factor: number;
};

export type EvLinkageOptions = {
  shutterValues?: number[];
  minGain?: number;
  maxGain?: number;
};

/**
 * Calculates effective exposure time and sensor gain based on a baseline
 * manual setting and an EV (exposure compensation) value.
 *
 * Physics model:
 * Total exposure factor = 2^EV.
 * - Primary adjustment: Shutter speed (exposure time) scales by factor.
 * - Nearest standard shutter stop is selected on logarithmic scale.
 * - Saturation / boundary fallback: If shutter reaches limits (or for remaining delta),
 *   gain is adjusted to compensate for the remaining exposure difference.
 */
export function calculateEvLinkedExposure(
  baseExposure: number,
  baseGain: number,
  ev: number,
): EvLinkageResult {
  const minGain = 0;
  const maxGain = 100;
  const shutterValues = SHUTTER_VALUES;

  const safeBaseExposure = Number.isFinite(baseExposure) && baseExposure > 0
    ? baseExposure
    : 0.08;
  const safeBaseGain = Number.isFinite(baseGain)
    ? Math.max(minGain, Math.min(maxGain, baseGain))
    : 10;
  const safeEv = Number.isFinite(ev) ? ev : 0;

  if (safeEv === 0) {
    return {
      exposure: safeBaseExposure,
      gain: safeBaseGain,
      formattedExposure: formatShutter(safeBaseExposure),
      formattedGain: String(safeBaseGain),
      factor: 1,
    };
  }

  const factor = 2 ** safeEv;
  const targetExposure = safeBaseExposure * factor;

  const minShutter = shutterValues[0];
  const maxShutter = shutterValues[shutterValues.length - 1];

  let bestShutter = safeBaseExposure;
  let bestLogDiff = Infinity;

  for (const stop of shutterValues) {
    const logDiff = Math.abs(Math.log2(stop / targetExposure));
    if (logDiff < bestLogDiff) {
      bestLogDiff = logDiff;
      bestShutter = stop;
    }
  }

  let finalGain = safeBaseGain;

  // If target exposure exceeds available shutter stops, compensate remainder via gain
  if (targetExposure > maxShutter) {
    bestShutter = maxShutter;
    const remainRatio = targetExposure / maxShutter;
    const gainDelta = Math.round(15 * Math.log2(remainRatio));
    finalGain = Math.max(minGain, Math.min(maxGain, safeBaseGain + gainDelta));
  }
  else if (targetExposure < minShutter) {
    bestShutter = minShutter;
    const remainRatio = targetExposure / minShutter;
    const gainDelta = Math.round(15 * Math.log2(remainRatio));
    finalGain = Math.max(minGain, Math.min(maxGain, safeBaseGain + gainDelta));
  }

  return {
    exposure: bestShutter,
    gain: finalGain,
    formattedExposure: formatShutter(bestShutter),
    formattedGain: String(finalGain),
    factor,
  };
}
