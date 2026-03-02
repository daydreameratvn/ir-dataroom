import { describe, it, expect } from 'vitest';
import { rgbToGrayscale, rgbToYCrCb, chwToHwc, hwcToChw } from '../utils/image-utils.ts';

describe('image-utils', () => {
  describe('rgbToGrayscale', () => {
    it('converts pure white to 255', () => {
      const rgb = new Uint8Array([255, 255, 255]);
      const gray = rgbToGrayscale(rgb, 1, 1);
      expect(gray[0]).toBeCloseTo(255, 0);
    });

    it('converts pure black to 0', () => {
      const rgb = new Uint8Array([0, 0, 0]);
      const gray = rgbToGrayscale(rgb, 1, 1);
      expect(gray[0]).toBe(0);
    });

    it('uses luminance formula', () => {
      // Pure red: Y = 0.299 * 255 = 76.245
      const rgb = new Uint8Array([255, 0, 0]);
      const gray = rgbToGrayscale(rgb, 1, 1);
      expect(gray[0]).toBeCloseTo(0.299 * 255, 1);
    });

    it('returns correct size output', () => {
      const rgb = new Uint8Array(12); // 2x2 * 3 channels
      const gray = rgbToGrayscale(rgb, 2, 2);
      expect(gray.length).toBe(4);
    });
  });

  describe('rgbToYCrCb', () => {
    it('returns three channels', () => {
      const rgb = new Uint8Array([128, 128, 128]);
      const result = rgbToYCrCb(rgb, 1, 1);
      expect(result.y.length).toBe(1);
      expect(result.cr.length).toBe(1);
      expect(result.cb.length).toBe(1);
    });

    it('gray pixel has Cr and Cb near 128', () => {
      const rgb = new Uint8Array([128, 128, 128]);
      const result = rgbToYCrCb(rgb, 1, 1);
      // For gray: R=G=B → Cr = (R-Y)*0.713+128, but R=Y so Cr≈128
      expect(result.cr[0]).toBeCloseTo(128, 0);
      expect(result.cb[0]).toBeCloseTo(128, 0);
    });
  });

  describe('chwToHwc', () => {
    it('converts CHW to HWC correctly', () => {
      // 2x2 image, 3 channels
      // CHW: [R00,R01,R10,R11, G00,G01,G10,G11, B00,B01,B10,B11]
      const chw = new Float32Array([
        10, 20, 30, 40,   // R channel
        50, 60, 70, 80,   // G channel
        90, 100, 110, 120, // B channel
      ]);
      const hwc = chwToHwc(chw, 3, 2, 2);
      // HWC: [R00,G00,B00, R01,G01,B01, R10,G10,B10, R11,G11,B11]
      expect(hwc[0]).toBe(10);  // R00
      expect(hwc[1]).toBe(50);  // G00
      expect(hwc[2]).toBe(90);  // B00
      expect(hwc[3]).toBe(20);  // R01
      expect(hwc[4]).toBe(60);  // G01
    });

    it('clamps values to 0-255', () => {
      const chw = new Float32Array([-10, 300]);
      const hwc = chwToHwc(chw, 1, 2, 1);
      expect(hwc[0]).toBe(0);
      expect(hwc[1]).toBe(255);
    });
  });

  describe('hwcToChw', () => {
    it('converts HWC to CHW correctly', () => {
      // 2x2 image, 3 channels
      const hwc = new Uint8Array([
        10, 50, 90,   // pixel (0,0)
        20, 60, 100,  // pixel (0,1)
        30, 70, 110,  // pixel (1,0)
        40, 80, 120,  // pixel (1,1)
      ]);
      const chw = hwcToChw(hwc, 3, 2, 2);
      // R channel: 10, 20, 30, 40
      expect(chw[0]).toBe(10);
      expect(chw[1]).toBe(20);
      expect(chw[2]).toBe(30);
      expect(chw[3]).toBe(40);
      // G channel: 50, 60, 70, 80
      expect(chw[4]).toBe(50);
      expect(chw[5]).toBe(60);
    });

    it('roundtrips with chwToHwc', () => {
      const original = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
      const chw = hwcToChw(original, 3, 2, 2);
      const result = chwToHwc(chw, 3, 2, 2);
      expect(Array.from(result)).toEqual(Array.from(original));
    });
  });
});
