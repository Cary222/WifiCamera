import type {
  DeleteResponse,
  ListPicFilesResponse,
  ListPicFoldersResponse,
  ListVideosMp4Response,
  ListVideosSerResponse,
  PicFile,
  PicFolder,
  VideoMediaItem,
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

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0)
    return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / 1024 ** i;
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatUnixTimestamp(seconds: number): string {
  if (!seconds || seconds <= 0)
    return '未校时';
  const ms = seconds < 1e11 ? seconds * 1000 : seconds;
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const secs = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${secs}`;
}

/**
 * Fetches all MP4 videos and SER recordings from the camera board.
 */
export async function listAllVideosAndSer(): Promise<VideoMediaItem[]> {
  const baseUrl = getAlbumBaseUrl();
  const items: VideoMediaItem[] = [];
  const seenPaths = new Set<string>();

  // 1. Fetch MP4 videos via /list_videos
  try {
    const mp4Url = `${baseUrl}${ALBUM_ENDPOINTS.listVideos}`;
    const res = await albumClient.get<ListVideosMp4Response>(mp4Url, {
      timeout: ALBUM_REQUEST_TIMEOUT_MS,
    });
    if (res.data?.ok && Array.isArray(res.data.videos)) {
      for (const v of res.data.videos) {
        if (!v.path || seenPaths.has(v.path))
          continue;
        seenPaths.add(v.path);
        const name = v.path.split(/[\\/]/).pop() || v.path;
        items.push({
          id: `mp4-${v.path}`,
          name,
          path: v.path,
          kind: 'mp4',
          size: v.size ?? 0,
          mtime: v.mtime ?? 0,
          videoUrl: `${baseUrl}${ALBUM_ENDPOINTS.getVideo}?path=${encodeURIComponent(v.path)}`,
          timestamp: formatUnixTimestamp(v.mtime ?? 0),
        });
      }
    }
  }
  catch (error) {
    console.warn('[album] fetch mp4 videos failed', error);
  }

  // 2. Fetch SER files via /list_videos?kind=ser&offset=...&limit=40 with pagination
  try {
    let offset: number | null = 0;
    const limit = 40;
    while (offset !== null && offset < 4096) {
      const currentOffset: number = offset;
      const serUrl: string = `${baseUrl}${ALBUM_ENDPOINTS.listVideos}?kind=ser&offset=${currentOffset}&limit=${limit}`;
      const res = await albumClient.get<ListVideosSerResponse>(serUrl, {
        timeout: ALBUM_REQUEST_TIMEOUT_MS,
      });
      if (!res.data?.ok || res.data.kind !== 'ser' || !Array.isArray(res.data.videos)) {
        break;
      }
      for (const v of res.data.videos) {
        if (!v.path || seenPaths.has(v.path))
          continue;
        seenPaths.add(v.path);
        items.push({
          id: `ser-${v.path}`,
          name: v.name || v.path.split(/[\\/]/).pop() || v.path,
          path: v.path,
          kind: 'ser',
          size: v.size ?? 0,
          mtime: v.mtime ?? 0,
          downloadable: v.downloadable ?? false,
          fileUrl: `${baseUrl}${ALBUM_ENDPOINTS.getFile}?path=${encodeURIComponent(v.path)}`,
          timestamp: formatUnixTimestamp(v.mtime ?? 0),
        });
      }
      offset = res.data.next_offset;
    }
  }
  catch (error) {
    console.warn('[album] fetch ser videos failed', error);
  }

  return items.sort((a, b) => b.mtime - a.mtime);
}

/**
 * Downloads a raw .ser file chunk-streamed directly to a local file.
 */
export async function downloadSerFile(params: {
  path: string;
  name: string;
  size?: number;
}): Promise<string> {
  const baseUrl = getAlbumBaseUrl();
  const fileUrl = `${baseUrl}${ALBUM_ENDPOINTS.getFile}?path=${encodeURIComponent(params.path)}`;
  const cacheDir = FileSystem.cacheDirectory ?? '';
  const tempUri = `${cacheDir}temp_${Date.now()}_${params.name}`;

  const downloadRes = await FileSystem.downloadAsync(fileUrl, tempUri);
  if (downloadRes.status !== 200) {
    await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
    if (downloadRes.status === 409) {
      throw new Error('SER_NOT_FINALIZED');
    }
    throw new Error(`DOWNLOAD_FAILED_${downloadRes.status}`);
  }

  const info = await FileSystem.getInfoAsync(tempUri);
  if (!info.exists || (params.size && params.size > 0 && info.size !== params.size)) {
    await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
    throw new Error('SER_SIZE_MISMATCH');
  }

  const docDir = FileSystem.documentDirectory ?? cacheDir;
  const finalUri = `${docDir}${params.name}`;
  await FileSystem.moveAsync({ from: tempUri, to: finalUri }).catch(async () => {
    await FileSystem.copyAsync({ from: tempUri, to: finalUri });
    await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
  });

  return finalUri;
}

/**
 * Saves an MP4 video to the phone's system photo album.
 */
export async function saveVideoToPhone(params: {
  videoUrl?: string;
  path?: string;
}): Promise<string> {
  const { status, granted } = await MediaLibrary.requestPermissionsAsync(true);
  if (!granted && status !== 'granted') {
    throw new Error('PERMISSION_DENIED');
  }

  const rawFilename = params.path ? params.path.split(/[\\/]/).pop() : null;
  const filename = rawFilename && rawFilename.length > 0 ? rawFilename : `video_${Date.now()}.mp4`;
  const cacheDir = FileSystem.cacheDirectory ?? '';
  const localUri = `${cacheDir}${Date.now()}_${filename}`;

  let videoUrl = params.videoUrl;
  if (!videoUrl && params.path) {
    const baseUrl = getAlbumBaseUrl();
    videoUrl = `${baseUrl}${ALBUM_ENDPOINTS.getVideo}?path=${encodeURIComponent(params.path)}`;
  }

  if (!videoUrl) {
    throw new Error('NO_VIDEO_SOURCE');
  }

  const downloadRes = await FileSystem.downloadAsync(videoUrl, localUri);
  if (downloadRes.status !== 200) {
    throw new Error(`DOWNLOAD_FAILED_${downloadRes.status}`);
  }

  await MediaLibrary.saveToLibraryAsync(localUri);
  return localUri;
}
