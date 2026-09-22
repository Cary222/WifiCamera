import type {
  DeleteResponse,
  ListPicFilesResponse,
  ListPicFoldersResponse,
  PicFile,
  PicFolder,
} from '../types';
/**
 * Album / file service — wraps camera HTTP client for the album API.
 * All endpoints follow the camera firmware JSON contract (snake_case).
 *
 * Network errors are caught and return empty arrays so the UI can still render
 * with mock data rather than crashing when the camera is unreachable.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { cameraClient } from '../../camera/client';
import { unwrapCamera } from '../../camera/errors';
import { getImage } from '../../camera/services/file-service';
import {
  ALBUM_ENDPOINTS,
  ALBUM_REQUEST_TIMEOUT_MS,
  getAlbumBaseUrl,
} from '../config';
import { watermarkLocalImageFile } from './image-watermark-service';

const albumClient = cameraClient;

export type BoardImageItem = {
  name: string;
  path: string;
  kind?: string;
  origin?: string;
  size?: number;
  mtime?: number;
};

type ListImagesResponse = {
  ok?: boolean;
  success?: boolean;
  images?: BoardImageItem[];
};

/**
 * Fetch all saved picture files / folders.
 * Prefers the C-stack `/list_images` endpoint, falling back to legacy
 * `/FileCopy/list_pic_folders/` or mock data when unreachable.
 */
export async function listPicFolders(): Promise<PicFolder[]> {
  const baseUrl = getAlbumBaseUrl();

  // 1. Try modern C-stack /list_images first
  try {
    const listImagesUrl = `${baseUrl}${ALBUM_ENDPOINTS.listImages}`;
    const res = await albumClient.get<ListImagesResponse>(listImagesUrl, {
      timeout: ALBUM_REQUEST_TIMEOUT_MS,
    });
    const images = res.data?.images;
    if (Array.isArray(images)) {
      // Filter out raw FITS/xyls data files; keep renderable jpg/png images
      const displayable = images.filter((img) => {
        const isFits = img.kind === 'fits' || img.name.endsWith('.fits');
        const isXyls = img.kind === 'xyls' || img.name.endsWith('.xyls');
        return !isFits && !isXyls;
      });

      return displayable.map(img => ({
        name: img.name,
        path: img.path,
        size: img.size ?? 0,
        mtime: img.mtime ?? Date.now() / 1000,
      }));
    }
  }
  catch (error) {
    // Not fatal: fall through to the legacy endpoint. Logged because a silent
    // failure here is indistinguishable from "the camera has no photos".
    console.warn('[album] /list_images failed', error);
  }

  // 2. Fall back to legacy /FileCopy/list_pic_folders/
  try {
    const legacyUrl = `${baseUrl}${ALBUM_ENDPOINTS.listPicFolders}`;
    const res = await albumClient.get<ListPicFoldersResponse>(legacyUrl, {
      timeout: ALBUM_REQUEST_TIMEOUT_MS,
    });
    const unwrapped = unwrapCamera(res.data, 'GET', legacyUrl);
    if (Array.isArray(unwrapped.pic_folders)) {
      return unwrapped.pic_folders;
    }
  }
  catch (error) {
    console.warn('[album] legacy /FileCopy/list_pic_folders/ failed', error);
  }

  // 3. Return empty list when camera has no photos or both endpoints fail.
  // Never show fake M33 mock data in production album.
  return [];
}

export async function listPicFiles(sourceDir: string): Promise<PicFile[]> {
  try {
    const url = `${getAlbumBaseUrl()}${ALBUM_ENDPOINTS.listPicFiles}`;
    const res = await albumClient.post<ListPicFilesResponse>(
      url,
      { source_dir: sourceDir },
      { timeout: ALBUM_REQUEST_TIMEOUT_MS },
    );
    return unwrapCamera(res.data, 'POST', url).pic_files;
  }
  catch (error) {
    console.warn(`[album] listPicFiles failed for ${sourceDir}`, error);
    return [];
  }
}

export async function deletePicFile(filePath: string): Promise<void> {
  const baseUrl = getAlbumBaseUrl();
  // 1. Try modern C-stack GET /delete?path=... first
  try {
    const url = `${baseUrl}${ALBUM_ENDPOINTS.delete}`;
    const res = await albumClient.get<{ ok?: boolean; deleted?: string[] }>(
      url,
      {
        params: { path: filePath },
        timeout: ALBUM_REQUEST_TIMEOUT_MS,
      },
    );
    if (res.data?.ok) {
      return;
    }
  }
  catch {
    // Fall through to legacy delete endpoint
  }

  // 2. Legacy fallback
  const legacyUrl = `${baseUrl}${ALBUM_ENDPOINTS.delPic}`;
  const res = await albumClient.post<DeleteResponse>(legacyUrl, {
    mp4_name: filePath,
  });
  unwrapCamera(res.data, 'POST', legacyUrl);
}

export async function deletePicFolder(sourceDir: string): Promise<void> {
  const baseUrl = getAlbumBaseUrl();
  // 1. Try modern C-stack GET /delete?path=... first
  try {
    const url = `${baseUrl}${ALBUM_ENDPOINTS.delete}`;
    const res = await albumClient.get<{ ok?: boolean; deleted?: string[] }>(
      url,
      {
        params: { path: sourceDir },
        timeout: ALBUM_REQUEST_TIMEOUT_MS,
      },
    );
    if (res.data?.ok) {
      return;
    }
  }
  catch {
    // Fall through to legacy delete endpoint
  }

  // 2. Legacy fallback
  const legacyUrl = `${baseUrl}${ALBUM_ENDPOINTS.delDir}`;
  const res = await albumClient.post<DeleteResponse>(legacyUrl, {
    source_dir: sourceDir,
  });
  unwrapCamera(res.data, 'POST', legacyUrl);
}

export {
  checkStorageCapabilities,
  FormatError,
  formatSdCard,
  getFormatTaskStatus,
} from './format-service';
export type {
  FormatErrorCode,
  FormatRequestPayload,
  FormatResponse,
  FormatResult,
  FormatSdCardOptions,
  FormatTaskStatusResponse,
  StorageStatusResponse,
} from './format-service';

/**
 * Downloads an image file from the camera board to the phone's local cache.
 */
export async function downloadImageFile(params: {
  previewUrl?: string;
  path?: string;
}): Promise<string> {
  const rawFilename = params.path ? params.path.split(/[\\/]/).pop() : null;
  const filename = rawFilename && rawFilename.length > 0 ? rawFilename : `photo_${Date.now()}.jpg`;
  const cacheDir = FileSystem.cacheDirectory ?? '';
  const localUri = `${cacheDir}${Date.now()}_${filename}`;

  if (params.previewUrl && params.previewUrl.startsWith('http')) {
    try {
      const downloadRes = await FileSystem.downloadAsync(params.previewUrl, localUri);
      return downloadRes.uri;
    }
    catch (error) {
      console.warn('[album] downloadAsync failed, attempting fallback', error);
    }
  }

  if (params.path) {
    const dataUri = await getImage(params.path);
    const base64Data = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;
    await FileSystem.writeAsStringAsync(localUri, base64Data, {
      encoding: 'base64',
    });
    return localUri;
  }

  throw new Error('NO_IMAGE_SOURCE');
}

/**
 * Downloads and saves an image to the phone's system photo album with permission handling.
 */
export async function saveImageToPhone(params: {
  previewUrl?: string;
  path?: string;
  watermark?: boolean;
}): Promise<string> {
  const { status, granted } = await MediaLibrary.requestPermissionsAsync(true);
  if (!granted && status !== 'granted') {
    throw new Error('PERMISSION_DENIED');
  }

  const localUri = await downloadImageFile(params);
  const shouldWatermark = params.watermark ?? true;
  const fileToSave = shouldWatermark ? await watermarkLocalImageFile(localUri) : localUri;
  await MediaLibrary.saveToLibraryAsync(fileToSave);
  return fileToSave;
}
