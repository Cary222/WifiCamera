import type { CameraApiResponse, CameraSerial, CameraVersion, UpdateTimePayload } from '../types';
import { cameraRequest } from '../client';
import { CAMERA_ENDPOINTS } from '../config';
import { unwrapCamera } from '../errors';

export type GetVersionResponse = CameraApiResponse<CameraVersion>;
export type GetSerialResponse = CameraApiResponse<CameraSerial>;

/**
 * GET /StartUp/GetVersion/
 * Returns the firmware version for the camera's server and hardware.
 */
export async function getVersion(): Promise<CameraVersion> {
  const payload = await cameraRequest<CameraVersion>(
    'get',
    CAMERA_ENDPOINTS.getVersion,
  );
  return unwrapCamera(payload, 'get', CAMERA_ENDPOINTS.getVersion);
}

/**
 * GET /StartUp/Serial/
 * Returns the device serial, magic number, hardware string and HD identifier.
 */
export async function getSerial(): Promise<CameraSerial> {
  const payload = await cameraRequest<CameraSerial>(
    'get',
    CAMERA_ENDPOINTS.getSerial,
  );
  return unwrapCamera(payload, 'get', CAMERA_ENDPOINTS.getSerial);
}

/**
 * POST /StartUp/UpdateTime/
 * Pushes the current time + numeric timezone offset to the camera.
 *
 * Payload field names (`time`, `time_zone`) are intentionally snake_case
 * because the firmware rejects the camelCase form.
 */
export async function postUpdateTime(input: UpdateTimePayload): Promise<void> {
  const payload = await cameraRequest<null>(
    'post',
    CAMERA_ENDPOINTS.postUpdateTime,
    input,
  );
  unwrapCamera(payload, 'post', CAMERA_ENDPOINTS.postUpdateTime);
}

/** Format as `YYYY-MM-DD HH:mm:ss` in local time — the form the firmware accepts. */
function formatBoardTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Push the phone's clock to the board.
 *
 * The board has no RTC battery and boots at 2021-01-01, so every file it writes
 * gets a stale mtime. `/list_images` sorts by mtime and truncates to the newest
 * 100 entries, which pushes freshly captured photos *behind* older correctly
 * dated ones — they vanish from the album even though they exist on disk.
 * Syncing on connect keeps capture timestamps monotonic with real time.
 *
 * Never throws: a failed sync must not block the control channel coming up.
 */
export async function syncBoardTime(): Promise<boolean> {
  try {
    const now = new Date();
    // getTimezoneOffset() counts minutes *behind* UTC, so invert it to get the
    // conventional east-positive offset in hours (UTC+8 -> 8).
    await postUpdateTime({
      time: formatBoardTime(now),
      time_zone: -now.getTimezoneOffset() / 60,
    });
    console.info('[camera] board clock synced', formatBoardTime(now));
    return true;
  }
  catch (error) {
    console.warn('[camera] board clock sync failed', error);
    return false;
  }
}
