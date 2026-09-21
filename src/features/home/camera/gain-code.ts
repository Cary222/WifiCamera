/**
 * Camera Gain is unified to integer 0~100 across all modes with step 1.
 * dB and register mappings are entirely handled by the board firmware.
 * UI displays unitless Gain 0~100 without percent or dB suffix.
 */
export const GAIN_MIN = 0;
export const GAIN_MAX = 100;
export const GAIN_STEP = 1;

export function clampGain(value: number): number {
 if (typeof value !== "number" || Number.isNaN(value)) {
  return GAIN_MIN;
 }
 return Math.min(GAIN_MAX, Math.max(GAIN_MIN, Math.round(value)));
}

export function formatGain(gain: number): string {
 return String(clampGain(gain));
}

// Backward-compatibility aliases (unitless display per 2026-09-20 spec)
export function formatGainDbNumber(code: number): string {
 return String(clampGain(code));
}

export function formatGainDb(code: number): string {
 return String(clampGain(code));
}

export function gainCodeToDb(code: number): number {
 return clampGain(code);
}
