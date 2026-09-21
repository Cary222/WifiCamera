import base64 from 'base64-js';
import * as FileSystem from 'expo-file-system/legacy';
import jpeg from 'jpeg-js';
import {
  applyWatermarkToJpegBytes,
  watermarkLocalImageFile,
} from './image-watermark-service';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///mock/cache/',
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
}));

describe('image-watermark-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('bakes watermark into a JPEG image while preserving dimensions', () => {
    const width = 200;
    const height = 100;
    const data = new Uint8Array(width * height * 4);
    // Fill with dark blue
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 10;
      data[i + 1] = 15;
      data[i + 2] = 30;
      data[i + 3] = 255;
    }

    const inputJpeg = jpeg.encode({ data, width, height }, 85).data;
    const outputJpegBytes = applyWatermarkToJpegBytes(inputJpeg);

    expect(outputJpegBytes).toBeInstanceOf(Uint8Array);
    expect(outputJpegBytes.length).toBeGreaterThan(0);

    const decoded = jpeg.decode(outputJpegBytes, { useTArray: true });
    expect(decoded.width).toBe(width);
    expect(decoded.height).toBe(height);
  });

  it('reads local image file, bakes watermark and writes out new file', async () => {
    const width = 100;
    const height = 50;
    const rawData = new Uint8Array(width * height * 4);
    const testJpeg = jpeg.encode({ data: rawData, width, height }, 80).data;
    const testBase64 = base64.fromByteArray(testJpeg);

    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(testBase64);
    (FileSystem.writeAsStringAsync as jest.Mock).mockResolvedValueOnce(undefined);

    const resultUri = await watermarkLocalImageFile('file:///mock/cache/test.jpg');

    expect(resultUri).toContain('wm_');
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith(
      'file:///mock/cache/test.jpg',
      expect.objectContaining({ encoding: 'base64' }),
    );
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      resultUri,
      expect.any(String),
      expect.objectContaining({ encoding: 'base64' }),
    );
  });

  it('falls back gracefully to original URI if watermarking fails', async () => {
    (FileSystem.readAsStringAsync as jest.Mock).mockRejectedValueOnce(new Error('Disk read error'));

    const result = await watermarkLocalImageFile('file:///original/path.jpg');
    expect(result).toBe('file:///original/path.jpg');
  });
});
