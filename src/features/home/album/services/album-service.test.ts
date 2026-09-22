import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import getAppConfig from '../../../../../app.config';
import { cameraClient } from '../../camera/client';
import {
  deletePicFile,
  deletePicFolder,
  downloadImageFile,
  downloadSerFile,
  formatBytes,
  formatSdCard,
  formatUnixTimestamp,
  listAllVideosAndSer,
  listPicFolders,
  saveImageToPhone,
  saveVideoToPhone,
} from './album-service';

jest.mock('../../camera/client', () => ({
  cameraClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///mock/cache/',
  documentDirectory: 'file:///mock/documents/',
  downloadAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  moveAsync: jest.fn(),
  copyAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
}));

jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn(),
  saveToLibraryAsync: jest.fn(),
}));

jest.mock('./image-watermark-service', () => ({
  watermarkLocalImageFile: jest.fn(uri => Promise.resolve(uri)),
}));

describe('album-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array when list_images has 0 images without falling back to mock data', async () => {
    (cameraClient.get as jest.Mock).mockResolvedValueOnce({
      data: {
        ok: true,
        images: [],
      },
    });

    const result = await listPicFolders();
    expect(result).toEqual([]);
    expect(cameraClient.get).toHaveBeenCalledTimes(1);
  });

  it('returns displayable images when list_images has files', async () => {
    (cameraClient.get as jest.Mock).mockResolvedValueOnce({
      data: {
        ok: true,
        images: [
          {
            name: 'photo1.jpg',
            path: '/mnt/sdcard/Pictures/photo1.jpg',
            size: 1024,
            mtime: 1700000000,
          },
          {
            name: 'data.fits',
            path: '/mnt/sdcard/Pictures/data.fits',
            kind: 'fits',
          },
        ],
      },
    });

    const result = await listPicFolders();
    expect(result).toEqual([
      {
        name: 'photo1.jpg',
        path: '/mnt/sdcard/Pictures/photo1.jpg',
        size: 1024,
        mtime: 1700000000,
      },
    ]);
  });

  it('returns empty array when both endpoints fail instead of fake mock M33 items', async () => {
    (cameraClient.get as jest.Mock)
      .mockRejectedValueOnce(new Error('Network error on list_images'))
      .mockRejectedValueOnce(new Error('Network error on legacy'));

    const result = await listPicFolders();
    expect(result).toEqual([]);
    expect(result.some(item => item.name === 'M33')).toBe(false);
  });
});

it('deletePicFile calls GET /delete?path=... first', async () => {
  (cameraClient.get as jest.Mock).mockResolvedValueOnce({
    data: { ok: true, deleted: ['/mnt/sdcard/Pictures/test.jpg'] },
  });

  await deletePicFile('/mnt/sdcard/Pictures/test.jpg');
  expect(cameraClient.get).toHaveBeenCalledWith(
    expect.stringContaining('/delete'),
    expect.objectContaining({
      params: { path: '/mnt/sdcard/Pictures/test.jpg' },
    }),
  );
  expect(cameraClient.post).not.toHaveBeenCalled();
});

it('deletePicFolder calls GET /delete?path=... first', async () => {
  (cameraClient.get as jest.Mock).mockResolvedValueOnce({
    data: { ok: true, deleted: ['/mnt/sdcard/Pictures/2026-09-18'] },
  });

  await deletePicFolder('/mnt/sdcard/Pictures/2026-09-18');
  expect(cameraClient.get).toHaveBeenCalledWith(
    expect.stringContaining('/delete'),
    expect.objectContaining({
      params: { path: '/mnt/sdcard/Pictures/2026-09-18' },
    }),
  );
  expect(cameraClient.post).not.toHaveBeenCalled();
});

it('formatSdCard rejects with FORMAT_ENDPOINT_NOT_AVAILABLE to report blocker instead of inventing endpoint', async () => {
  await expect(formatSdCard()).rejects.toThrow('FORMAT_ENDPOINT_NOT_AVAILABLE');
});

it('saveImageToPhone requests write-only permission and throws PERMISSION_DENIED without downloading when media library permission is not granted', async () => {
  (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
    granted: false,
    status: 'denied',
  });

  await expect(
    saveImageToPhone({ previewUrl: 'http://camera/get_image?path=test.jpg' }),
  ).rejects.toThrow('PERMISSION_DENIED');
  expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(true);
  expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
  expect(MediaLibrary.saveToLibraryAsync).not.toHaveBeenCalled();
});

it('saveImageToPhone requests write-only permission, downloads, and saves image to library when permission is granted', async () => {
  (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
    granted: true,
    status: 'granted',
  });
  (FileSystem.downloadAsync as jest.Mock).mockResolvedValueOnce({
    uri: 'file:///mock/cache/saved.jpg',
  });
  (MediaLibrary.saveToLibraryAsync as jest.Mock).mockResolvedValueOnce(undefined);

  const uri = await saveImageToPhone({
    previewUrl: 'http://camera/get_image?path=test.jpg',
    path: '/mnt/sdcard/Pictures/test.jpg',
  });

  expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(true);
  expect(uri).toBe('file:///mock/cache/saved.jpg');
  expect(FileSystem.downloadAsync).toHaveBeenCalled();
  expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith('file:///mock/cache/saved.jpg');
});

it('ensures app.config configures expo-media-library plugin with write-only permission descriptions', () => {
  const config = getAppConfig({ config: {} } as any);
  const mediaLibraryPlugin = config.plugins?.find((p) => {
    if (Array.isArray(p))
      return p[0] === 'expo-media-library';
    return p === 'expo-media-library';
  });

  expect(mediaLibraryPlugin).toBeDefined();
  expect(Array.isArray(mediaLibraryPlugin)).toBe(true);
  if (Array.isArray(mediaLibraryPlugin)) {
    const options = mediaLibraryPlugin[1] as Record<string, any>;
    expect(options.photosPermission).toBe(false);
    expect(typeof options.savePhotosPermission).toBe('string');
    expect(options.savePhotosPermission.length).toBeGreaterThan(0);
  }
});

it('downloadImageFile downloads remote url to local uri', async () => {
  (FileSystem.downloadAsync as jest.Mock).mockResolvedValueOnce({
    uri: 'file:///mock/cache/downloaded.jpg',
  });

  const uri = await downloadImageFile({
    previewUrl: 'http://camera/get_image?path=sample.jpg',
    path: '/mnt/sdcard/Pictures/sample.jpg',
  });

  expect(uri).toBe('file:///mock/cache/downloaded.jpg');
  expect(FileSystem.downloadAsync).toHaveBeenCalled();
});

it('formatBytes formats bytes into human readable units', () => {
  expect(formatBytes(0)).toBe('0 B');
  expect(formatBytes(15)).toBe('15 B');
  expect(formatBytes(1178)).toBe('1.2 KB');
  expect(formatBytes(16186)).toBe('15.8 KB');
  expect(formatBytes(78796978)).toBe('75.1 MB');
  expect(formatBytes(31264342016)).toBe('29.1 GB');
});

it('formatUnixTimestamp converts seconds to formatted date string', () => {
  expect(formatUnixTimestamp(0)).toBe('未校时');
  const ts = formatUnixTimestamp(1790056009);
  expect(ts).toContain('2026-');
});

it('listAllVideosAndSer fetches both MP4 and SER files, combines and sorts them', async () => {
  (cameraClient.get as jest.Mock)
    .mockResolvedValueOnce({
      data: {
        ok: true,
        videos: [{ path: '/mnt/sdcard/Videos/rec_01.mp4', size: 5000, mtime: 1000 }],
      },
    })
    .mockResolvedValueOnce({
      data: {
        ok: true,
        kind: 'ser',
        total: 1,
        offset: 0,
        limit: 40,
        next_offset: null,
        videos: [
          {
            name: 'planet_01.ser',
            path: '/mnt/sdcard/Videos/planet_01.ser',
            kind: 'ser',
            size: 20000,
            mtime: 2000,
            downloadable: true,
          },
        ],
      },
    });

  const result = await listAllVideosAndSer();
  expect(result).toHaveLength(2);
  expect(result[0].kind).toBe('ser');
  expect(result[0].name).toBe('planet_01.ser');
  expect(result[1].kind).toBe('mp4');
  expect(result[1].name).toBe('rec_01.mp4');
});

it('downloadSerFile downloads file, checks size, moves to documents directory', async () => {
  (FileSystem.downloadAsync as jest.Mock).mockResolvedValueOnce({ status: 200 });
  (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: true, size: 1024 });
  (FileSystem.moveAsync as jest.Mock).mockResolvedValueOnce(undefined);

  const finalUri = await downloadSerFile({
    path: '/mnt/sdcard/Videos/test.ser',
    name: 'test.ser',
    size: 1024,
  });

  expect(finalUri).toBe('file:///mock/documents/test.ser');
  expect(FileSystem.downloadAsync).toHaveBeenCalled();
  expect(FileSystem.moveAsync).toHaveBeenCalled();
});

it('downloadSerFile throws SER_NOT_FINALIZED when server returns 409', async () => {
  (FileSystem.downloadAsync as jest.Mock).mockResolvedValueOnce({ status: 409 });
  (FileSystem.deleteAsync as jest.Mock).mockResolvedValueOnce(undefined);

  await expect(
    downloadSerFile({ path: '/mnt/sdcard/Videos/recording.ser', name: 'recording.ser' }),
  ).rejects.toThrow('SER_NOT_FINALIZED');
});

it('saveVideoToPhone downloads video and saves to media library', async () => {
  (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: true, status: 'granted' });
  (FileSystem.downloadAsync as jest.Mock).mockResolvedValueOnce({ status: 200 });
  (MediaLibrary.saveToLibraryAsync as jest.Mock).mockResolvedValueOnce(undefined);

  const uri = await saveVideoToPhone({ path: '/mnt/sdcard/Videos/sample.mp4' });
  expect(uri).toContain('sample.mp4');
  expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalled();
});
