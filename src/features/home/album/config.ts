/**
 * Album / file API endpoints — mirrors the camera firmware contract.
 */
import { getCameraBaseUrl } from '../camera/config';

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

/**
 * Album requests must target the same endpoint as preview/capture.
 *
 * This used to read `Env.EXPO_PUBLIC_CAMERA_BASE_URL` directly, which is the
 * USB/emulator forward (`10.0.2.2:18999`) and is unreachable on a real device
 * over the board's WiFi AP — every album request failed and the screen silently
 * fell back to mock data. Delegating to `getCameraBaseUrl()` follows the active
 * transport (USB vs WiFi, including a user-configured camera IP) and keeps the
 * web dev proxy path working.
 */
export function getAlbumBaseUrl(): string {
  return getCameraBaseUrl();
}
