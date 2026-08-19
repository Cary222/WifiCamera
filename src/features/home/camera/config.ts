import { getActiveTransport, getTransportEndpoints } from './transport';

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
 *
 * Resolved per call rather than cached, because the active transport can change
 * at runtime (USB relay vs the board's own WiFi AP).
 */
export function getCameraBaseUrl(): string {
  return getTransportEndpoints(getActiveTransport()).base;
}

export function getCameraWebSocketUrl(): string {
  return getCameraBaseUrl().replace(/^http/, 'ws') + CAMERA_WEBSOCKET_PATH;
}

/**
 * MediaMTX serves WHEP on 8889 directly over WiFi. Over USB the URL points at
 * the host relay instead, because ADB forward only carries TCP signaling while
 * WebRTC media is UDP.
 */
export function getCameraWhepUrl(): string {
  return getTransportEndpoints(getActiveTransport()).whep;
}
