/**
 * Error Level Analysis (ELA) method.
 *
 * Detects forgeries by analyzing compression artifacts between
 * the original image and its JPEG-recompressed version.
 *
 * Pure TypeScript implementation using sharp for JPEG encode/decode.
 */

import sharp from 'sharp';

import type {
  ForensicMethod,
  MethodInput,
  BenchmarkOutput,
} from './base.ts';

export interface ELAOptions {
  quality?: number;
  displayMultiplier?: number;
}

export class ELA implements ForensicMethod {
  readonly name = 'ela';
  readonly type = 'traditional' as const;
  readonly description = 'Error Level Analysis - JPEG compression artifact detection';

  readonly quality: number;
  readonly displayMultiplier: number;

  constructor(options: ELAOptions = {}) {
    this.quality = options.quality ?? 75;
    this.displayMultiplier = options.displayMultiplier ?? 20;
  }

  async benchmark(input: MethodInput): Promise<BenchmarkOutput> {
    const { width, height, channels } = input;

    // Get raw RGB pixel data (HWC interleaved)
    let hwcData: Uint8Array;
    if (input.image instanceof Buffer) {
      hwcData = new Uint8Array(input.image);
    } else if (input.image instanceof Float32Array) {
      // CHW float → HWC uint8
      const size = width * height;
      hwcData = new Uint8Array(size * channels);
      for (let c = 0; c < channels; c++) {
        for (let i = 0; i < size; i++) {
          hwcData[i * channels + c] = Math.max(
            0,
            Math.min(255, Math.round(input.image[c * size + i]!)),
          );
        }
      }
    } else {
      hwcData = input.image;
    }

    // JPEG re-encode then decode
    const jpegBuffer = await sharp(Buffer.from(hwcData.buffer), {
      raw: { width, height, channels: channels as 3 },
    })
      .jpeg({ quality: this.quality })
      .toBuffer();

    const { data: recompressedRaw } = await sharp(jpegBuffer)
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Compute absolute pixel difference per channel, scaled
    const size = width * height;
    const heatmap = new Float32Array(size);

    for (let i = 0; i < size; i++) {
      let sumDiff = 0;
      for (let c = 0; c < channels; c++) {
        const idx = i * channels + c;
        const diff = Math.abs(hwcData[idx]! - recompressedRaw[idx]!);
        sumDiff += diff;
      }
      const avgDiff = sumDiff / channels;
      heatmap[i] = Math.min(avgDiff * this.displayMultiplier, 255) / 255;
    }

    return {
      heatmap,
      mask: null,
      detection: null,
      width,
      height,
    };
  }
}

export function createELA(options?: ELAOptions): ForensicMethod {
  return new ELA(options);
}
