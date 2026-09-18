import { cameraClient } from '../../camera/client';
import { listPicFolders } from './album-service';

jest.mock('../../camera/client', () => ({
  cameraClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
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
