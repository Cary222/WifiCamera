import type { CameraApiResponse } from './types';

import axios from 'axios';
import { Platform } from 'react-native';
import { getItem } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { CAMERA_REQUEST_TIMEOUT_MS, getCameraBaseUrl } from './config';
import { CameraApiError } from './errors';
import { getActiveTransport } from './transport';

export const cameraClient = axios.create({
  timeout: CAMERA_REQUEST_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

/** Metro dev server port; on web the app is served from here so we can proxy. */
const METRO_PORT = 8081;

// Resolved per request instead of at module load, so switching between the USB
// relay and the board's WiFi AP takes effect without rebuilding this instance.
cameraClient.interceptors.request.use((config) => {
  if (Platform.OS === 'web') {
    const transport = getActiveTransport();
    const baseUrl = getCameraBaseUrl();

    // Build proxy URL with transport and camera IP
    let proxyUrl = `/camera-proxy/?transport=${transport}&path=${config.url}`;

    if (transport === 'wifi') {
      // Extract IP from stored WiFi camera address
      const storedIp = getItem<string>(STORAGE_KEYS.WIFI_CAMERA_IP);
      if (storedIp) {
        proxyUrl += `&ip=${storedIp}`;
      }
      // Extract port from base URL if non-standard
      try {
        const base = new URL(baseUrl);
        if (base.port && base.port !== '80') {
          proxyUrl += `&port=${base.port}`;
        }
      }
      catch {
        // Use default port 8999
      }
    }

    config.url = proxyUrl;
    config.baseURL = `http://localhost:${METRO_PORT}`;
    console.log('[cameraClient] Web 模式请求:', config.url);
  }
  else {
    config.baseURL = getCameraBaseUrl();
  }
  return config;
});

cameraClient.interceptors.response.use(
  response => response,
  error => Promise.reject(CameraApiError.fromAxios(error)),
);

export async function cameraRequest<T>(
  method: 'get' | 'post',
  url: string,
  data?: unknown,
): Promise<CameraApiResponse<T>> {
  const response = await cameraClient.request<CameraApiResponse<T>>({
    method,
    url,
    data,
  });
  return response.data;
}
