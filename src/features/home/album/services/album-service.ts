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
import { cameraClient } from '../../camera/client';
import { unwrapCamera } from '../../camera/errors';
import {
  ALBUM_ENDPOINTS,
  ALBUM_REQUEST_TIMEOUT_MS,
  getAlbumBaseUrl,
} from '../config';
import { MOCK_ALBUM_DATA } from '../mock-data';

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
    if (Array.isArray(images) && images.length > 0) {
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
        mtime: img.mtime ?? (Date.now() / 1000),
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
    if (Array.isArray(unwrapped.pic_folders) && unwrapped.pic_folders.length > 0) {
      return unwrapped.pic_folders;
    }
  }
  catch (error) {
    console.warn('[album] legacy /FileCopy/list_pic_folders/ failed', error);
  }

  // 3. Mock fallback
  console.warn(`[album] both endpoints returned nothing at ${baseUrl} — showing mock data`);
  return MOCK_ALBUM_DATA.groups.flatMap(group =>
    group.items.map(item => ({
      name: item.target,
      size: 0,
      mtime: Date.now() / 1000,
      _mock: true,
    })),
  );
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

export async function deletePicFile(mp4Name: string): Promise<void> {
  const url = `${getAlbumBaseUrl()}${ALBUM_ENDPOINTS.delPic}`;
  const res = await albumClient.post<DeleteResponse>(url, {
    mp4_name: mp4Name,
  });
  unwrapCamera(res.data, 'POST', url);
}

export async function deletePicFolder(sourceDir: string): Promise<void> {
  const url = `${getAlbumBaseUrl()}${ALBUM_ENDPOINTS.delDir}`;
  const res = await albumClient.post<DeleteResponse>(url, {
    source_dir: sourceDir,
  });
  unwrapCamera(res.data, 'POST', url);
}
