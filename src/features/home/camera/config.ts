import Env from 'env';

/**
 * Camera-specific runtime configuration.
 *
 * This is intentionally separate from `@/lib/api/client.tsx`, which talks to
 * the SkySense cloud backend. Mixing the two would couple LAN cleartext calls
 * to the cloud HTTPS path.
 */
export const CAMERA_REQUEST_TIMEOUT_MS = 8_000;

export const CAMERA_ENDPOINTS = {
  getVersion: '/StartUp/GetVersion/',
  getSerial: '/StartUp/Serial/',
  postUpdateTime: '/StartUp/UpdateTime/',
} as const;

export const CAMERA_WEBSOCKET_PATH = '/ws/device/';

export type CameraEndpointKey = keyof typeof CAMERA_ENDPOINTS;

/**
 * Resolved base URL for the camera HTTP API.
 * The default is applied once while building the validated environment object.
 */
export function getCameraBaseUrl(): string {
  return Env.EXPO_PUBLIC_CAMERA_BASE_URL;
}

export function getCameraWebSocketUrl(): string {
  return getCameraBaseUrl().replace(/^http/, 'ws') + CAMERA_WEBSOCKET_PATH;
}
