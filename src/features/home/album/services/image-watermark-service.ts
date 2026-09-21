import base64 from 'base64-js';
import * as FileSystem from 'expo-file-system/legacy';
import jpeg from 'jpeg-js';

import {
  WATERMARK_ALPHA_BASE64,
  WATERMARK_HEIGHT,
  WATERMARK_WIDTH,
} from './watermark-mask-data';

let cachedAlphaMask: Uint8Array | null = null;

function getAlphaMask(): Uint8Array {
  if (!cachedAlphaMask) {
    cachedAlphaMask = base64.toByteArray(WATERMARK_ALPHA_BASE64);
  }
  return cachedAlphaMask;
}

/**
 * Composites the official AURORCEP watermark logo onto raw JPEG binary bytes.
 */
export function applyWatermarkToJpegBytes(jpegBytes: Uint8Array): Uint8Array {
  const decoded = jpeg.decode(jpegBytes, { useTArray: true });
  const pw = decoded.width;
  const ph = decoded.height;
  const photoData = decoded.data;
  const alphaMask = getAlphaMask();

  // Watermark width: ~26% of photo width (matches Figma design ratio)
  const wmDisplayWidth = Math.round(pw * 0.26);
  const wmDisplayHeight = Math.round(wmDisplayWidth * (WATERMARK_HEIGHT / WATERMARK_WIDTH));
  const startX = Math.round((pw - wmDisplayWidth) / 2);
  const startY = ph - wmDisplayHeight - Math.round(ph * 0.04);

  for (let dy = 0; dy < wmDisplayHeight; dy++) {
    const targetY = startY + dy;
    if (targetY < 0 || targetY >= ph)
      continue;
    const srcY = Math.floor(dy * (WATERMARK_HEIGHT / wmDisplayHeight));

    for (let dx = 0; dx < wmDisplayWidth; dx++) {
      const targetX = startX + dx;
      if (targetX < 0 || targetX >= pw)
        continue;

      const srcX = Math.floor(dx * (WATERMARK_WIDTH / wmDisplayWidth));
      const a = alphaMask[srcY * WATERMARK_WIDTH + srcX];
      if (a === 0)
        continue;

      const alpha = (a / 255) * 0.9;
      const dstIdx = (targetY * pw + targetX) * 4;

      photoData[dstIdx] = Math.round(photoData[dstIdx] * (1 - alpha) + 255 * alpha);
      photoData[dstIdx + 1] = Math.round(photoData[dstIdx + 1] * (1 - alpha) + 255 * alpha);
      photoData[dstIdx + 2] = Math.round(photoData[dstIdx + 2] * (1 - alpha) + 255 * alpha);
    }
  }

  const encoded = jpeg.encode({ data: photoData, width: pw, height: ph }, 92);
  return encoded.data;
}

/**
 * Reads an image file from a local URI, bakes the persistent AURORCEP watermark into it,
 * writes the result to a cache JPEG file, and returns the watermarked file URI.
 */
export async function watermarkLocalImageFile(localUri: string): Promise<string> {
  try {
    const base64Data = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = base64.toByteArray(base64Data);
    const watermarkedBytes = applyWatermarkToJpegBytes(bytes);
    const watermarkedBase64 = base64.fromByteArray(watermarkedBytes);

    const outUri = `${FileSystem.cacheDirectory}wm_${Date.now()}.jpg`;
    await FileSystem.writeAsStringAsync(outUri, watermarkedBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return outUri;
  }
  catch (error) {
    console.warn('[Watermark] Failed to apply watermark, falling back to original image', error);
    return localUri;
  }
}
