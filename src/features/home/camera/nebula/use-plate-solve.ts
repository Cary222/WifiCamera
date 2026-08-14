import { useCallback, useState } from 'react';
import { useCameraStore } from '../camera-store';

export type PlateSolveState = 'idle' | 'saving' | 'solving';

export type PlateSolveResult = {
  success: boolean;
  ra: number | null;
  dec: number | null;
  orientation: number | null;
  pixelScale: number | null;
  fieldWidth: number | null;
  fieldHeight: number | null;
  imagePath: string;
  error: string;
  elapsedMs: number;
};

type SolveSource = {
  sample?: string;
};

type CommandMessage = Record<string, unknown>;

const EMPTY_RESULT: PlateSolveResult = {
  success: false,
  ra: null,
  dec: null,
  orientation: null,
  pixelScale: null,
  fieldWidth: null,
  fieldHeight: null,
  imagePath: '',
  error: '',
  elapsedMs: 0,
};

function parseJsonObject(value: unknown): CommandMessage | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value))
    return value as CommandMessage;
  if (typeof value !== 'string')
    return null;
  try {
    const parsed: unknown = JSON.parse(value.trim());
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as CommandMessage
      : null;
  }
  catch {
    return null;
  }
}

/** Board firmware versions wrap the solve result differently; normalize it. */
function extractPlateSolvePayload(message: CommandMessage): CommandMessage {
  const data = parseJsonObject(message.data) ?? {};
  const nested = parseJsonObject(data.result)
    ?? parseJsonObject(data.solve_result)
    ?? parseJsonObject(data.json)
    ?? parseJsonObject(message.result);
  return nested ? { ...data, ...nested } : Object.keys(data).length ? data : message;
}

function firstFiniteNumber(source: CommandMessage, keys: string[]): number | null {
  for (const key of keys) {
    const raw = source[key];
    if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean')
      continue;
    const value = Number(raw);
    if (Number.isFinite(value))
      return value;
  }
  return null;
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== 'string')
      continue;
    const text = value.trim();
    if (text && !/^(see data|ok)$/i.test(text))
      return text;
  }
  return '';
}

function parseSolveSuccess(value: unknown): boolean | null {
  if (value === true || value === 1 || value === '1' || value === 'true')
    return true;
  if (value === false || value === 0 || value === '0' || value === 'false')
    return false;
  return null;
}

function extractImagePath(message: CommandMessage): string {
  if (typeof message.data === 'string' && !message.data.trim().startsWith('{'))
    return message.data.trim();
  const data = parseJsonObject(message.data);
  return firstText(
    data?.jpg_path,
    data?.path,
    data?.pic_name,
    data?.image_path,
    message.jpg_path,
    message.path,
    message.pic_name,
    message.image_path,
  );
}

function toSolveResult(message: CommandMessage, elapsedMs: number): PlateSolveResult {
  const payload = extractPlateSolvePayload(message);
  const ra = firstFiniteNumber(payload, ['ra_deg', 'ra', 'center_ra_deg', 'center_ra']);
  const dec = firstFiniteNumber(payload, ['dec_deg', 'dec', 'center_dec_deg', 'center_dec']);
  const orientation = firstFiniteNumber(payload, ['orientation_deg_east_of_north', 'orientation_deg', 'orientation']);
  const pixelScale = firstFiniteNumber(payload, ['pixel_scale_arcsec_per_pixel', 'pixel_scale', 'pixscale']);
  const fieldWidth = firstFiniteNumber(payload, ['field_width_deg', 'field_width', 'width_deg']);
  const fieldHeight = firstFiniteNumber(payload, ['field_height_deg', 'field_height', 'height_deg']);
  const explicitSuccess = parseSolveSuccess(payload.success);
  const commandFailed = message.success === false
    || message.ok === false
    || (Number.isFinite(Number(message.service_code)) && Number(message.service_code) !== 0);
  const success = !commandFailed && (explicitSuccess === true || (explicitSuccess !== false && ra !== null && dec !== null));

  return {
    success,
    ra,
    dec,
    orientation,
    pixelScale,
    fieldWidth,
    fieldHeight,
    imagePath: firstText(payload.image_path, payload.path),
    error: success
      ? ''
      : firstText(
        payload.error,
        payload.message,
        payload.reason,
        payload.traceback,
        message.error,
        message.message,
        typeof message.data === 'string' ? message.data : '',
      ) || '未匹配到可用星图或返回结果缺少坐标',
    elapsedMs,
  };
}

/**
 * Saves the current streaming frame to SD card, then asks the board to blind
 * solve it. The sequencing avoids competing camera frame grabs.
 */
export function usePlateSolve() {
  const connectionStatus = useCameraStore.use.connectionStatus();
  const sendCommandWait = useCameraStore.use.sendCommandWait();
  const [solveState, setSolveState] = useState<PlateSolveState>('idle');
  const [result, setResult] = useState<PlateSolveResult | null>(null);

  const solve = useCallback(async (source: SolveSource = {}) => {
    if (solveState !== 'idle')
      return;
    if (connectionStatus !== 'open') {
      setResult({ ...EMPTY_RESULT, error: '设备未连接' });
      return;
    }

    const startedAt = Date.now();
    setResult(null);
    try {
      if (!source.sample) {
        setSolveState('saving');
        const rawPath = `/mnt/sdcard/Pictures/solve_raw_${Date.now()}.jpg`;
        const capture = await sendCommandWait('capture_stream_frame', [rawPath], 10_000);
        if (capture.timeout)
          throw new Error('当前帧原图保存超时，已取消本次解析');
        if (capture.error)
          throw new Error(capture.error);
        if (!capture.msg || capture.msg.success === false)
          throw new Error('当前帧原图保存失败，已取消本次解析');
        if (!extractImagePath(capture.msg))
          throw new Error('板端未返回当前帧原图路径，已取消本次解析');
      }

      setSolveState('solving');
      const solveResponse = await sendCommandWait('start_plate_solve', source.sample ? [source.sample] : [], 120_000);
      const elapsedMs = Date.now() - startedAt;
      if (solveResponse.timeout) {
        setResult({ ...EMPTY_RESULT, error: '等待板端解析结果超时（120 秒）', elapsedMs });
        return;
      }
      if (solveResponse.error) {
        setResult({ ...EMPTY_RESULT, error: solveResponse.error, elapsedMs });
        return;
      }
      if (!solveResponse.msg) {
        setResult({ ...EMPTY_RESULT, error: '板端未返回解析结果', elapsedMs });
        return;
      }
      setResult(toSolveResult(solveResponse.msg, elapsedMs));
    }
    catch (error) {
      setResult({
        ...EMPTY_RESULT,
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - startedAt,
      });
    }
    finally {
      setSolveState('idle');
    }
  }, [connectionStatus, sendCommandWait, solveState]);

  const dismissResult = useCallback(() => setResult(null), []);

  return { solveState, result, solve, dismissResult };
}
