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
