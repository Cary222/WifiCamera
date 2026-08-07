import { getAlbumBaseUrl } from '../../home/album/config';
/**
 * Settings service — wraps camera HTTP client for WiFi/OTA/settings API.
 * All endpoints follow the camera firmware JSON contract (snake_case).
 */
import { cameraClient } from '../../home/camera/client';

export const SETTINGS_ENDPOINTS = {
  changeWifiPassword: '/StartUp/ChangeWifiPassword/',
  otaCheck: '/OTAUpdate/check_package/',
  otaStart: '/OTAUpdate/start_update/',
} as const;

export const SETTINGS_REQUEST_TIMEOUT_MS = 15_000;

/**
 * Plain success response — no data payload.
 * Some camera firmware endpoints return only { success: true }.
 */
type PlainSuccessResponse = {
  success: true;
};

function unwrapPlainSuccess(payload: unknown, method: string, url: string): void {
  if (payload && typeof payload === 'object' && (payload as PlainSuccessResponse).success === true) {
    return;
  }
  throw new Error(`[${method}] ${url} — non-success response: ${JSON.stringify(payload)}`);
}

export async function changeWifiPassword(password: string): Promise<void> {
  const url = `${getAlbumBaseUrl()}${SETTINGS_ENDPOINTS.changeWifiPassword}`;
  const res = await cameraClient.post<PlainSuccessResponse>(url, { password });
  unwrapPlainSuccess(res.data, 'POST', url);
}

export async function checkOtaPackage(filename: string): Promise<void> {
  const url = `${getAlbumBaseUrl()}${SETTINGS_ENDPOINTS.otaCheck}`;
  const res = await cameraClient.post<PlainSuccessResponse>(url, { package: filename });
  unwrapPlainSuccess(res.data, 'POST', url);
}

export async function startOtaUpdate(filename: string): Promise<void> {
  const url = `${getAlbumBaseUrl()}${SETTINGS_ENDPOINTS.otaStart}`;
  const res = await cameraClient.post<PlainSuccessResponse>(url, { package: filename });
  unwrapPlainSuccess(res.data, 'POST', url);
}
