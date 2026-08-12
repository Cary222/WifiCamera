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

/**
 * Fetch all saved picture folders.
 * On network error (camera unreachable) returns mock folder data.
 */
export async function listPicFolders(): Promise<PicFolder[]> {
  try {
    const url = `${getAlbumBaseUrl()}${ALBUM_ENDPOINTS.listPicFolders}`;
    const res = await albumClient.get<ListPicFoldersResponse>(url, {
      timeout: ALBUM_REQUEST_TIMEOUT_MS,
    });
    return unwrapCamera(res.data, 'GET', url).pic_folders;
  }
  catch {
    // Camera unreachable — return mock folder list derived from mock data.
    return MOCK_ALBUM_DATA.groups.flatMap(group =>
      group.items.map(item => ({
        name: item.target,
        size: 0,
        mtime: Date.now() / 1000,
        _mock: true,
      })),
    );
  }
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
  catch {
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
