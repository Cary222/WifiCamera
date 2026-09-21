/**
 * Shutter series shared by 风景模式 (landscape) and 星空模式 (nebula) rulers.
 *
 * The sub-second stops keep the original 1/1000s … 1s series untouched; the
 * long-exposure stops extend the app's selectable range up to 60s.
 */
export const SHUTTER_VALUES = [
  0.001,
  0.00125,
  0.0016,
  0.002,
  0.0025,
  0.0033,
  0.004,
  0.005,
  0.0067,
  0.008,
  0.01,
  0.0125,
  0.0167,
  0.02,
  0.025,
  0.033,
  0.04,
  0.05,
  0.067,
  0.08,
  0.1,
  0.125,
  0.167,
  0.2,
  0.25,
  0.33,
  0.5,
  0.67,
  1,
  1.5,
  2,
  3,
  4,
  5,
  6,
  8,
  10,
  13,
  15,
  20,
  25,
  30,
  40,
  50,
  60,
];

/** Rulers label stops below 1s as fractions and 1s and above as plain seconds. */
export function formatShutter(value: number): string {
  return value >= 1 ? `${value}` : `1/${Math.round(1 / value)}`;
}
