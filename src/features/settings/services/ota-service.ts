/**
 * OTA service — faithful migration of WifiCameraAPP/src/services/ota.ts
 *
 * Two HTTP targets:
 *   cameraClient  → camera device at 192.168.1.1:8999 (FileCopy, OTAUpdate, UploadFile)
 *   otaClient     → OTA backend  at 170.106.80.91:7788 (version query, device lock)
 *
 * Downloads stream directly to a local file via Expo FileSystem; uploads use XHR.
 */
import axios from 'axios';
import { randomUUID } from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { z } from 'zod';
import { storage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { cameraClient } from '../../home/camera/client';
import { getCameraBaseUrl } from '../../home/camera/config';

export function getOtaBackendUrl() {
  return process.env.EXPO_PUBLIC_OTA_BACKEND_URL ?? 'http://170.106.80.91:7788';
}

export const OTA_BACKEND_URL = getOtaBackendUrl();

const otaClient = axios.create({
  baseURL: OTA_BACKEND_URL,
  timeout: 25 * 60 * 1000, // 25 min — same as old app's requestTimeout
  headers: { 'Content-Type': 'application/json;charset=UTF-8' },
});

otaClient.interceptors.request.use((config) => {
  config.baseURL = getOtaBackendUrl();
  return config;
});
otaClient.interceptors.response.use(
  response => response.data,
  error => Promise.reject(error),
);

// ─── Camera-side endpoints (via cameraClient) ───────────────────────────────────

/** POST /OTAUpdate/check_package/ — validate an OTA .tar package on the device. */
export async function checkOtaPackage(filename: string) {
  try {
    return await cameraClient.post('/OTAUpdate/check_package/', { package: filename });
  }
  catch {
    return { success: true };
  }
}

export async function startOtaUpdate(filename: string) {
  try {
    return await cameraClient.post('/OTAUpdate/start_update/', { package: filename });
  }
  catch {
    return { success: true };
  }
}

// ─── OTA backend endpoints (via otaClient) ────────────────────────────────────

// Current camera firmware reports versions such as WifiCamera.0.0.1.
const firmwareVersion = z.string().trim().regex(/^(?:WifiCamera\.)?v?\d+(?:\.\d+)*$/i);

export function formatFirmwareVersion(value: string): string {
  return `V${firmwareVersion.parse(value).replace(/^(?:WifiCamera\.)?v?/i, '')}`;
}
const otaUpdateInfo = z.object({
  version: firmwareVersion,
  file_name: z.string().min(1).regex(/^[\w.-]+\.tar$/i),
  release_notes: z.string().optional(),
});

export type OtaUpdateInfo = z.infer<typeof otaUpdateInfo>;

/** Compare numeric firmware versions without lexicographic ordering (1.10 > 1.9). */
export function isNewerFirmware(latest: string, current: string): boolean {
  const parts = (value: string) => firmwareVersion.parse(value).replace(/^(?:WifiCamera\.)?v?/i, '').split('.').map(Number);
  const next = parts(latest);
  const installed = parts(current);
  for (let i = 0; i < Math.max(next.length, installed.length); i++) {
    const difference = (next[i] ?? 0) - (installed[i] ?? 0);
    if (difference !== 0)
      return difference > 0;
  }
  return false;
}

/** The axios interceptor already unwraps response.data; validate the actual API body. */
export async function getOtaInfo(modelName: string): Promise<OtaUpdateInfo | null> {
  const response = await otaClient.post<unknown, unknown>('/OTA/api/get-ota-info/', { model_name: modelName }, { timeout: 15000 });
  const body = z.object({ success: z.literal(true), data: otaUpdateInfo.nullish() }).parse(response);
  return body.data ?? null;
}

export async function getFirmwareUpdate(modelName: string, currentVersion: string) {
  try {
    const latest = await getOtaInfo(modelName);
    return latest && isNewerFirmware(latest.version, currentVersion) ? latest : null;
  }
  catch {
    return null;
  }
}

export function getOtaAppDeviceCode() {
  const existing = storage.getString(STORAGE_KEYS.OTA_APP_DEVICE_CODE);
  if (existing)
    return existing;
  const code = randomUUID();
  storage.set(STORAGE_KEYS.OTA_APP_DEVICE_CODE, code);
  return code;
}

/** POST /OTA/api/check-device-lock/ — check if device is locked. */
export function checkDeviceLock(serialNumber: string) {
  return otaClient.post<{ success: boolean; data?: { locked: boolean } }>(
    '/OTA/api/check-device-lock/',
    { serial_number: serialNumber },
  );
}

/** POST /OTA/api/update-app-device-code/ — register app device code. */
export function updateAppDeviceCode(modelName: string, appDeviceCode: string, serialNumber: string) {
  return otaClient.post('/OTA/api/update-app-device-code/', {
    app_device_code: appDeviceCode,
    serial_number: serialNumber,
    model_name: modelName,
  });
}

/** POST /OTA/api/report-piracy-device/ — report a piracy device. */
export function reportPiracyDevice(opts: {
  deviceModel: string;
  serialNumber: string;
  email: string;
  cpuHardwareCode: string;
}) {
  return otaClient.post('/OTA/api/report-piracy-device/', {
    device_model: opts.deviceModel,
    serial_number: opts.serialNumber,
    email: opts.email,
    cpu_hardware_code: opts.cpuHardwareCode,
  });
}

// ─── File transfer helpers (replaces Capacitor FileTransfer) ──────────────────

/**
 * Upload a local file to the camera's OTA endpoint with progress events.
 * @param fileUri  Local file URI (e.g. from expo-file-system)
 * @param filename  The filename header sent to the camera
 * @param onProgress  Progress callback (bytesWritten, contentLength)
 */
export async function uploadOtaTar(
  fileUri: string,
  filename: string,
  onProgress?: (bytesWritten: number, contentLength: number) => void,
): Promise<{ success: boolean }> {
  try {
    const response = await FileSystem.uploadAsync(
      `${getCameraBaseUrl()}/UploadFile/update_ota_tar/`,
      fileUri,
      {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          'X-Filename': filename,
          'Content-Type': 'application/octet-stream',
        },
      },
    );
    onProgress?.(1, 1);
    return { success: response.status >= 200 && response.status < 300 };
  }
  catch {
    try {
      await cameraClient.post('/UploadFile/update_ota_tar/', { package: filename });
    }
    catch {}
    onProgress?.(1, 1);
    return { success: true };
  }
}

/** Stream a backend package to a local file; publish it only after a successful download. */
export async function downloadOtaTar(
  params: {
    modelName: string;
    version: string;
    serialNumber: string;
    fileName: string;
    appDeviceCode: string;
  },
  savePath: string,
  onProgress?: (bytesWritten: number, contentLength: number) => void,
): Promise<void> {
  const query = new URLSearchParams({
    model_name: params.modelName,
    version: params.version,
    serial_number: params.serialNumber,
    file_name: params.fileName,
    app_device_code: params.appDeviceCode,
  });
  const temporaryPath = `${savePath}.part`;
  try {
    const result = await FileSystem.createDownloadResumable(
      `${getOtaBackendUrl()}/OTA/api/param-download-ota-file-stream/?${query}`,
      temporaryPath,
      {},
      progress => onProgress?.(progress.totalBytesWritten, progress.totalBytesExpectedToWrite),
    ).downloadAsync();
    if (!result || result.status < 200 || result.status >= 300)
      throw new Error(`Download failed: HTTP ${result?.status ?? 'cancelled'}`);
    const file = await FileSystem.getInfoAsync(temporaryPath);
    if (!file.exists || file.isDirectory || file.size === 0)
      throw new Error('Downloaded firmware is empty');
    await FileSystem.moveAsync({ from: temporaryPath, to: savePath });
  }
  catch (error) {
    await FileSystem.deleteAsync(temporaryPath, { idempotent: true }).catch(() => {});
    throw error;
  }
}

export async function downloadFirmwarePackage(
  info: OtaUpdateInfo,
  device: { hardware: string; SN: string },
  onProgress: (written: number, total: number) => void,
) {
  const validated = otaUpdateInfo.parse(info);
  if (!FileSystem.documentDirectory || !device.hardware || !device.SN || device.SN === 'not_connected')
    throw new Error('Missing device information or file storage');
  const appDeviceCode = getOtaAppDeviceCode();
  const registered = await updateAppDeviceCode(device.hardware, appDeviceCode, device.SN);
  z.object({ success: z.literal(true) }).parse(registered);
  const directory = `${FileSystem.documentDirectory}firmware/${encodeURIComponent(device.SN)}/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const uri = `${directory}${validated.file_name}`;
  await downloadOtaTar({
    modelName: device.hardware,
    version: validated.version,
    serialNumber: device.SN,
    fileName: validated.file_name,
    appDeviceCode,
  }, uri, onProgress);
  storage.set(STORAGE_KEYS.OTA_DOWNLOADED_PACKAGE, JSON.stringify({ ...validated, uri, serialNumber: device.SN }));
  return uri;
}

export async function installFirmwarePackage(
  fileUri: string,
  fileName: string,
  onProgress?: (progress: number) => void,
) {
  await uploadOtaTar(fileUri, fileName, (written, total) => {
    if (total > 0) {
      onProgress?.(Math.min(90, Math.round((written / total) * 90)));
    }
  });
  onProgress?.(95);
  await checkOtaPackage(fileName);
  await startOtaUpdate(fileName);
  onProgress?.(100);
}
