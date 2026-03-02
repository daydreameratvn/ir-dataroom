/**
 * Image utility functions for color conversion and pixel manipulation.
 */

/**
 * Convert RGB pixel data to grayscale using luminance formula.
 * Y = 0.299*R + 0.587*G + 0.114*B
 */
export function rgbToGrayscale(
  rgb: Uint8Array | Float32Array,
  width: number,
  height: number,
): Float32Array {
  const size = width * height;
  const gray = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const idx = i * 3;
    gray[i] = 0.299 * rgb[idx]! + 0.587 * rgb[idx + 1]! + 0.114 * rgb[idx + 2]!;
  }
  return gray;
}

/**
 * Convert RGB to YCrCb color space.
 */
export function rgbToYCrCb(
  rgb: Uint8Array,
  width: number,
  height: number,
): { y: Float32Array; cr: Float32Array; cb: Float32Array } {
  const size = width * height;
  const y = new Float32Array(size);
  const cr = new Float32Array(size);
  const cb = new Float32Array(size);

  for (let i = 0; i < size; i++) {
    const idx = i * 3;
    const r = rgb[idx]!;
    const g = rgb[idx + 1]!;
    const b = rgb[idx + 2]!;

    y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    cr[i] = (r - y[i]!) * 0.713 + 128;
    cb[i] = (b - y[i]!) * 0.564 + 128;
  }

  return { y, cr, cb };
}

/**
 * Convert CHW format (channels-first) to HWC interleaved format.
 */
export function chwToHwc(
  chw: Float32Array,
  channels: number,
  width: number,
  height: number,
): Uint8Array {
  const size = width * height;
  const hwc = new Uint8Array(size * channels);
  for (let c = 0; c < channels; c++) {
    const channelOffset = c * size;
    for (let i = 0; i < size; i++) {
      hwc[i * channels + c] = Math.max(
        0,
        Math.min(255, Math.round(chw[channelOffset + i]!)),
      );
    }
  }
  return hwc;
}

/**
 * Convert HWC interleaved format to CHW channels-first format.
 */
export function hwcToChw(
  hwc: Uint8Array,
  channels: number,
  width: number,
  height: number,
): Float32Array {
  const size = width * height;
  const chw = new Float32Array(channels * size);
  for (let c = 0; c < channels; c++) {
    const channelOffset = c * size;
    for (let i = 0; i < size; i++) {
      chw[channelOffset + i] = hwc[i * channels + c]!;
    }
  }
  return chw;
}
