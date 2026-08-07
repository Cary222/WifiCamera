import type { CameraApiResponse } from './types';

import axios from 'axios';
import { CAMERA_REQUEST_TIMEOUT_MS, getCameraBaseUrl } from './config';
import { CameraApiError } from './errors';

export const cameraClient = axios.create({
  baseURL: getCameraBaseUrl(),
  timeout: CAMERA_REQUEST_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
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
