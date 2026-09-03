import { appLogger } from '@/lib/app-logger';

let epoch = 0;
let t0 = 0;

/**
 * One clock for the landscape preview bring-up. t0 is the moment the App
 * sends `start_streaming`. Later points log elapsed ms from that send.
 */
export function markStreamStart(reason: string): void {
  epoch += 1;
  t0 = Date.now();
  logStreamPoint('t0_start_streaming', { reason });
}

export function logStreamPoint(
  point: string,
  extra?: Record<string, unknown>,
): void {
  const elapsedMs = t0 === 0 ? -1 : Date.now() - t0;
  const payload = { epoch, elapsedMs, point, ...extra };
  appLogger.info('STREAM_T', `${point} +${elapsedMs}ms`, payload);
  console.info(`[STREAM_T] epoch=${epoch} ${point} +${elapsedMs}ms`, extra ?? '');
}
