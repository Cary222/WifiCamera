/**
 * Album / file API endpoints — mirrors the camera firmware contract.
 */
import Env from 'env';

export const ALBUM_ENDPOINTS = {
  listImages: '/list_images',
  listVideos: '/list_videos',
  getImage: '/get_image',
  getVideo: '/get_video',
  delete: '/delete',
  listPicFolders: '/FileCopy/list_pic_folders/',
  listPicFiles: '/FileCopy/list_pic_files/',
  delPic: '/FileCopy/del_mp4/',
  delDir: '/FileCopy/del_dir/',
} as const;

export const ALBUM_REQUEST_TIMEOUT_MS = 15_000;

export function getAlbumBaseUrl(): string {
  return Env.EXPO_PUBLIC_CAMERA_BASE_URL;
}
