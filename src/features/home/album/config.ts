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

/**
 * PROPOSED storage format endpoints (Draft contract — NOT yet implemented on firmware).
 * Firmware main@c6fb93c does not have these routes. They are subject to firmware alignment.
 */
export const PROPOSED_STORAGE_ENDPOINTS = {
  status: '/storage/status',
  format: '/storage/format',
  formatStatus: '/storage/format/status',
} as const;

export const ALBUM_REQUEST_TIMEOUT_MS = 15_000;
export const FORMAT_CHECK_TIMEOUT_MS = 5_000;
export const FORMAT_POST_TIMEOUT_MS = 10_000;
export const FORMAT_POLL_INTERVAL_MS = 1_000;
export const FORMAT_MAX_POLL_ATTEMPTS = 90;

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
