/**
 * OTA service — faithful migration of WifiCameraAPP/src/services/ota.ts
 *
 * Two HTTP targets:
 *   cameraClient  → camera device at 192.168.1.1:8999 (FileCopy, OTAUpdate, UploadFile)
 *   otaClient     → OTA backend  at 170.106.80.91:7788 (version query, device lock)
 *
 * File transfer (upload .tar → camera, download .tar) uses XMLHttpRequest so we can
 * emit progress events for the UI layer. This replaces the Capacitor FileTransfer plugin
 * from the old app.
 */
import axios from 'axios';
import { cameraClient } from '../../camera/client';
import { getCameraBaseUrl } from '../../camera/config';

/** OTA backend base URL. Override via EXPO_PUBLIC_OTA_BACKEND_URL env var. */
export const OTA_BACKEND_URL
  = process.env.EXPO_PUBLIC_OTA_BACKEND_URL ?? 'http://170.106.80.91:7788';

const otaClient = axios.create({
  baseURL: OTA_BACKEND_URL,
  timeout: 25 * 60 * 1000, // 25 min — same as old app's requestTimeout
  headers: { 'Content-Type': 'application/json;charset=UTF-8' },
});
otaClient.interceptors.response.use(
  response => response.data,
  error => Promise.reject(error),
);

// ─── Camera-side endpoints (via cameraClient) ───────────────────────────────────

/** POST /OTAUpdate/check_package/ — validate an OTA .tar package on the device. */
export function checkOtaPackage(filename: string) {
  return cameraClient.post('/OTAUpdate/check_package/', { package: filename });
}

/** POST /OTAUpdate/start_update/ — trigger OTA update on the device. */
export function startOtaUpdate(filename: string) {
  return cameraClient.post('/OTAUpdate/start_update/', { package: filename });
}

// ─── OTA backend endpoints (via otaClient) ────────────────────────────────────

/** POST /OTA/api/get-ota-info/ — query latest OTA version info for a model. */
export function getOtaInfo(modelName: string) {
  return otaClient.post<{
    success: boolean;
    data?: { version: string; file_name: string; release_notes?: string };
  }>('/OTA/api/get-ota-info/', { model_name: modelName });
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
export function uploadOtaTar(
  fileUri: string,
  filename: string,
  onProgress?: (bytesWritten: number, contentLength: number) => void,
): Promise<{ success: boolean }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${getCameraBaseUrl()}/UploadFile/update_ota_tar/`, true);
    xhr.setRequestHeader('X-Filename', filename);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded, event.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve({ success: data?.success ?? true });
        }
        catch {
          resolve({ success: true });
        }
      }
      else {
        reject(new Error(`Upload failed: HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Upload network error'));

    fetch(fileUri)
      .then(res => res.blob())
      .then(blob => xhr.send(blob))
      .catch(reject);
  });
}

/**
 * Download an OTA .tar from the backend with progress events.
 * @param params  Download query parameters (modelName, version, serialNumber, fileName, appDeviceCode)
 * @param savePath  Local path to save the blob (via expo-file-system)
 * @param onProgress  Progress callback (bytesWritten, contentLength)
 */
export function downloadOtaTar(
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
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams({
      model_name: params.modelName,
      version: params.version,
      serial_number: params.serialNumber,
      file_name: params.fileName,
      app_device_code: params.appDeviceCode,
    });
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `${OTA_BACKEND_URL}/OTA/api/param-download-ota-file-stream/?${query}`, true);
    xhr.responseType = 'blob';

    xhr.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded, event.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
        // TODO: write blob to savePath using expo-file-system writeFile
        void savePath;
        resolve();
      }
      else {
        reject(new Error(`Download failed: HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Download network error'));
    xhr.send();
  });
}
