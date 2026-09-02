/**
 * Board 8999 `change_streaming_setting` gain is IMX662 analogue-gain code.
 * One code step is 0.3 dB. The App still sends the integer code; UI shows real dB.
 */
export const GAIN_DB_PER_CODE = 0.3;

export function gainCodeToDb(code: number): number {
  return Math.round(code * 3) / 10;
}

export function formatGainDbNumber(code: number): string {
  const db = gainCodeToDb(code);
  return Number.isInteger(db) ? String(db) : db.toFixed(1);
}

export function formatGainDb(code: number): string {
  return `${formatGainDbNumber(code)} dB`;
}
