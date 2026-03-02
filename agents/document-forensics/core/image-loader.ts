/**
 * Unified image loading and validation via sharp.
 */

import { existsSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import sharp from 'sharp';

import { MAX_IMAGE_SIZE } from '../config.ts';

export interface ImageInfo {
  width: number;
  height: number;
  format: string;
  fileSizeBytes: number;
}

/**
 * Load an image, validate it, optionally resize, and return as CHW Float32Array.
 */
export async function loadAndValidate(
  imagePath: string,
  maxSize: number = MAX_IMAGE_SIZE,
): Promise<{
  data: Float32Array;
  width: number;
  height: number;
  channels: number;
}> {
  if (!existsSync(imagePath)) {
    throw new FileNotFoundError(`Image not found: ${imagePath}`);
  }

  let pipeline = sharp(imagePath, { failOn: 'none' }).removeAlpha().toColorspace('srgb');

  const meta = await pipeline.metadata();
  if (!meta.width || !meta.height) {
    throw new ImageDecodeError(`Failed to decode image: ${imagePath}`);
  }

  let width = meta.width;
  let height = meta.height;

  if (Math.max(width, height) > maxSize) {
    const scale = maxSize / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
    pipeline = pipeline.resize(width, height, { fit: 'fill' });
  }

  const { data: rawBuffer, info } = await pipeline
    .raw()
    .toBuffer({ resolveWithObject: true });

  width = info.width;
  height = info.height;
  const channels = info.channels;

  // Convert to Float32Array in CHW format
  const size = width * height;
  const chw = new Float32Array(channels * size);

  for (let c = 0; c < channels; c++) {
    const channelOffset = c * size;
    for (let i = 0; i < size; i++) {
      chw[channelOffset + i] = rawBuffer[i * channels + c]!;
    }
  }

  return { data: chw, width, height, channels };
}

/**
 * Load an image and return as HWC Uint8Array (RGB).
 */
export async function loadAsUint8HWC(
  imagePath: string,
  maxSize: number = MAX_IMAGE_SIZE,
): Promise<{
  data: Uint8Array;
  width: number;
  height: number;
  channels: number;
}> {
  if (!existsSync(imagePath)) {
    throw new FileNotFoundError(`Image not found: ${imagePath}`);
  }

  let pipeline = sharp(imagePath, { failOn: 'none' }).removeAlpha().toColorspace('srgb');

  const meta = await pipeline.metadata();
  if (!meta.width || !meta.height) {
    throw new ImageDecodeError(`Failed to decode image: ${imagePath}`);
  }

  let width = meta.width;
  let height = meta.height;

  if (Math.max(width, height) > maxSize) {
    const scale = maxSize / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
    pipeline = pipeline.resize(width, height, { fit: 'fill' });
  }

  const { data: rawBuffer, info } = await pipeline
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data: new Uint8Array(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.length),
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

/**
 * Get basic image metadata without loading full pixel data.
 */
export async function getImageInfo(imagePath: string): Promise<ImageInfo> {
  if (!existsSync(imagePath)) {
    throw new FileNotFoundError(`Image not found: ${imagePath}`);
  }

  const meta = await sharp(imagePath, { failOn: 'none' }).metadata();
  if (!meta.width || !meta.height) {
    throw new ImageDecodeError(`Failed to decode image: ${imagePath}`);
  }

  const ext = extname(imagePath).toLowerCase();
  const fmtMap: Record<string, string> = {
    '.jpg': 'jpeg',
    '.jpeg': 'jpeg',
    '.png': 'png',
    '.bmp': 'bmp',
    '.tiff': 'tiff',
    '.tif': 'tiff',
    '.webp': 'webp',
  };

  return {
    width: meta.width,
    height: meta.height,
    format: meta.format ?? fmtMap[ext] ?? ext,
    fileSizeBytes: statSync(imagePath).size,
  };
}

export class FileNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileNotFoundError';
  }
}

export class ImageDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageDecodeError';
  }
}
