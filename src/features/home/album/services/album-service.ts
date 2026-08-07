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
 */
import { cameraClient } from '../../camera/client';
import { unwrapCamera } from '../../camera/errors';
import {
  ALBUM_ENDPOINTS,
  ALBUM_REQUEST_TIMEOUT_MS,
  getAlbumBaseUrl,
} from '../config';

const albumClient = cameraClient;

export async function listPicFolders(): Promise<PicFolder[]> {
  const url = `${getAlbumBaseUrl()}${ALBUM_ENDPOINTS.listPicFolders}`;
  const res = await albumClient.get<ListPicFoldersResponse>(url, {
    timeout: ALBUM_REQUEST_TIMEOUT_MS,
  });
  return unwrapCamera(res.data, 'GET', url).pic_folders;
}

export async function listPicFiles(sourceDir: string): Promise<PicFile[]> {
  const url = `${getAlbumBaseUrl()}${ALBUM_ENDPOINTS.listPicFiles}`;
  const res = await albumClient.post<ListPicFilesResponse>(
    url,
    { source_dir: sourceDir },
    { timeout: ALBUM_REQUEST_TIMEOUT_MS },
  );
  return unwrapCamera(res.data, 'POST', url).pic_files;
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
