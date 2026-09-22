/**
 * File service — camera FileCopy HTTP endpoints.
 * Migrated from WifiCameraAPP/src/services/api.ts.
 * Uses native fetch (for binary/image) and axios (for JSON) — no Capacitor dependency.
 */
import { cameraClient } from '../client';
import { getCameraBaseUrl } from '../config';
import { unwrapCamera } from '../errors';

function arrayBufferToDataUri(buffer: ArrayBuffer, mimeType = 'image/jpeg'): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

/**
 * Board firmware serves JPEGs from the root-level GET endpoint. The older
 * POST /FileCopy/get_image/ endpoint returns 404 on the current firmware.
 */
export async function getImage(filePath: string): Promise<string> {
  const response = await fetch(`${getCameraBaseUrl()}/get_image?path=${encodeURIComponent(filePath)}`);

  if (!response.ok) {
    throw new Error(`[GET IMAGE] HTTP ${response.status} for ${filePath}`);
  }

  const buffer = await response.arrayBuffer();
  return arrayBufferToDataUri(buffer);
}

/** POST /FileCopy/ask_jpg_stretch/ — trigger FITS→JPG stretch on camera side. */
export async function askJpgStretch(fitsName: string): Promise<void> {
  const res = await cameraClient.post('/FileCopy/ask_jpg_stretch/', {
    fits_name: fitsName,
  });
  unwrapCamera(res.data as Parameters<typeof unwrapCamera>[0], 'POST', '/FileCopy/ask_jpg_stretch/');
}

/** POST /FileCopy/upload_fits_jpeg/ — upload JPEG paired with a FITS file. */
export async function uploadFitsJpeg(file: Blob, fitsName: string): Promise<boolean> {
  const formData = new FormData();
  formData.append('file', file as unknown as Blob, `${fitsName}.jpg`);
  formData.append('fits_name', fitsName);

  const res = await cameraClient.post('/FileCopy/upload_fits_jpeg/', formData as unknown as Record<string, unknown>, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  const unwrapped = unwrapCamera(res.data as Parameters<typeof unwrapCamera>[0], 'POST', '/FileCopy/upload_fits_jpeg/') as { upload?: boolean };
  return unwrapped?.upload ?? false;
}

/**
 * GET /FileCopy/power/ — battery percentage and charging state.
 * The board reports `-1` for both fields when no battery gauge is present.
 */
export async function getPower(): Promise<{ power: number; in_charging: number }> {
  const res = await cameraClient.get<{ success: true; data: { power: number; in_charging: number } }>(
    '/FileCopy/power/',
  );
  return unwrapCamera(res.data, 'GET', '/FileCopy/power/');
}

/** GET /FileCopy/get_disks/ — list of storage mount points. */
export async function getDisks(): Promise<string[]> {
  const res = await cameraClient.get<{ success: true; data: { disks: string[] } }>(
    '/FileCopy/get_disks/',
  );
  return unwrapCamera(res.data, 'GET', '/FileCopy/get_disks/').disks;
}
export type StorageStatusData = {
  mounted: boolean;
  ready: boolean;
  reason?: string;
  mount_point: string | null;
};

export async function getStorageStatus(): Promise<StorageStatusData | null> {
  const baseUrl = getCameraBaseUrl();
  try {
    const res = await cameraClient.get<{
      ok?: boolean;
      mounted?: boolean;
      error?: string;
      capacity_bytes?: number;
      success?: boolean;
      data?: StorageStatusData;
    }>(`${baseUrl}/storage/status`);
    if (res.data?.ok !== undefined) {
      const mounted = res.data.mounted ?? (res.data.error !== 'NO_CARD');
      return {
        mounted,
        ready: mounted && !res.data.error,
        reason: res.data.error || (mounted ? 'OK' : 'NO_CARD'),
        mount_point: mounted ? '/mnt/sdcard' : null,
      };
    }
  }
  catch {
    // fallback to legacy
  }

  try {
    const res = await cameraClient.get<{ success: boolean; data: StorageStatusData }>(
      `${baseUrl}/FileCopy/storage_status/`,
    );
    if (res.data?.success && res.data?.data) {
      return res.data.data;
    }
    return null;
  }
  catch {
    return null;
  }
}

export async function getSdCardMountPoint(): Promise<string | null> {
  try {
    const status = await getStorageStatus();
    if (status) {
      return status.mounted && status.mount_point ? status.mount_point : null;
    }
    const res = await cameraClient.get<{ success: true; data: { mount_point: string | null; mounted?: boolean } }>(
      `${getCameraBaseUrl()}/FileCopy/get_sd_card_mount_point/`,
    );
    const data = unwrapCamera(res.data, 'GET', '/FileCopy/get_sd_card_mount_point/');
    if (data.mounted === false) {
      return null;
    }
    return data.mount_point;
  }
  catch {
    return null;
  }
}

/**
 * GET /FileCopy/get_disk_usage/ — current firmware reports used/total/free in GB.
 * (Verified against the connected board: total 29.1074, used 12.3161.)
 * @param mountPoint - optional mount point to query specific disk
 */
export async function getDiskUsage(mountPoint?: string): Promise<{ used: number; total: number; free?: number }> {
  const params = mountPoint ? { mount_point: mountPoint } : {};
  const res = await cameraClient.get<{ success: true; data: { used: number; total: number; free?: number } }>(
    `${getCameraBaseUrl()}/FileCopy/get_disk_usage/`,
    { params },
  );
  return unwrapCamera(res.data, 'GET', '/FileCopy/get_disk_usage/');
}

/** GET /FileCopy/list_mp4/ — list of recorded video files. */
export type Mp4File = { name: string; size: number; mtime: number };

export async function listMp4(): Promise<Mp4File[]> {
  const res = await cameraClient.get<{ success: true; data: { mp4_files: Mp4File[] } }>(
    '/FileCopy/list_mp4/',
  );
  return unwrapCamera(res.data, 'GET', '/FileCopy/list_mp4/').mp4_files;
}
