import { Platform } from 'react-native';
import { getItem } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';
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

/** Detect if running in web browser (vs native app). */
function isWebPlatform(): boolean {
  return Platform.OS === 'web';
}

/**
 * Camera proxy server port for web development.
 * This matches the port in metro.config.js where the WebSocket proxy runs.
 */
const CAMERA_PROXY_PORT = 8099;

/**
 * Get the camera IP for WiFi mode.
 * Returns the stored IP or the default 192.168.1.1.
 */
export function getWifiCameraIp(): string {
  const storedIp = getItem<string>(STORAGE_KEYS.WIFI_CAMERA_IP);
  return storedIp || '192.168.1.1';
}

/**
 * Resolved base URL for the camera HTTP API.
 *
 * Resolved per call rather than cached, because the active transport can change
 * at runtime (USB relay vs the board's own WiFi AP).
 *
 * For web platform, returns localhost proxy server which handles WebSocket
 * and HTTP forwarding to the actual camera address. In WiFi mode, includes
 * the camera IP in the proxy URL so Metro can forward to the correct target.
 */
export function getCameraBaseUrl(): string {
  if (isWebPlatform()) {
    return `http://localhost:${CAMERA_PROXY_PORT}`;
  }
  return getTransportEndpoints(getActiveTransport()).base;
}

/**
 * Resolved WebSocket URL for camera control channel.
 *
 * For web platform, returns localhost proxy server which tunnels WebSocket
 * connections to the actual camera address. In WiFi mode, the WebSocket
 * proxy reads the camera IP from query parameters.
 */
export function getCameraWebSocketUrl(): string {
  if (isWebPlatform()) {
    const transport = getActiveTransport();
    // Use proxy server address for web
    let wsUrl = `ws://localhost:${CAMERA_PROXY_PORT}${CAMERA_WEBSOCKET_PATH}`;

    // Add query parameters for WiFi mode
    if (transport === 'wifi') {
      const ip = getWifiCameraIp();
      wsUrl += `?transport=wifi&ip=${ip}`;
      console.log('[config] Web WiFi 模式 WebSocket URL:', wsUrl);
    }
    else {
      wsUrl += `?transport=usb`;
      console.log('[config] Web USB 模式 WebSocket URL:', wsUrl);
    }

    return wsUrl;
  }
  return getTransportEndpoints(getActiveTransport()).base.replace(/^http/, 'ws') + CAMERA_WEBSOCKET_PATH;
}

/**
 * MediaMTX serves WHEP on 8889 directly over WiFi. Over USB the URL points at
 * the host relay instead, because ADB forward only carries TCP signaling while
 * WebRTC media is UDP.
 *
 * Note: WHEP proxying for web is not yet implemented; this URL is primarily
 * used by native apps. Web may fall back to mock mode for video preview.
 */
export function getCameraWhepUrl(): string {
  return getTransportEndpoints(getActiveTransport()).whep;
}
