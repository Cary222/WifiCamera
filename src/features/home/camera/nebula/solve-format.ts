/**
 * Plate-solve coordinate formatting, ported from the browser reference app so
 * the app and the web simulator render identical values.
 */

/** Degrees to right ascension, shown as hours/minutes/seconds. */
export function formatRaCoordinate(value: number): string {
  if (!Number.isFinite(value))
    return '--';
  const degrees = ((value % 360) + 360) % 360;
  const tenths = Math.round((degrees / 15) * 36000) % (24 * 36000);
  const hours = Math.floor(tenths / 36000);
  const minutes = Math.floor((tenths % 36000) / 600);
  const seconds = (tenths % 600) / 10;
  return `${degrees.toFixed(5)}° / ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${seconds.toFixed(1).padStart(4, '0')}s`;
}

/** Degrees to declination, shown as signed degrees/arcminutes/arcseconds. */
export function formatDecCoordinate(value: number): string {
  if (!Number.isFinite(value))
    return '--';
  const sign = value < 0 ? '−' : '+';
  const tenths = Math.round(Math.abs(value) * 36000);
  const degrees = Math.floor(tenths / 36000);
  const minutes = Math.floor((tenths % 36000) / 600);
  const seconds = (tenths % 600) / 10;
  return `${value.toFixed(5)}° / ${sign}${String(degrees).padStart(2, '0')}° ${String(minutes).padStart(2, '0')}′ ${seconds.toFixed(1).padStart(4, '0')}″`;
}

export function formatSolveElapsed(elapsedMs: number): string {
  if (!Number.isFinite(elapsedMs))
    return '';
  return elapsedMs < 1000 ? `${Math.round(elapsedMs)} ms` : `${(elapsedMs / 1000).toFixed(2)} 秒`;
}
