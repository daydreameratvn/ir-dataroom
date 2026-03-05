import { describe, it, expect } from 'vitest';
import { rgbToGrayscale, rgbToYCrCb, chwToHwc, hwcToChw } from '../utils/image-utils.ts';

describe('rgbToGrayscale', () => {
  describe('known color conversions', () => {
    it('should convert pure white (255,255,255) to 255', () => {
      const rgb = new Uint8Array([255, 255, 255]);
      const gray = rgbToGrayscale(rgb, 1, 1);
      expect(gray[0]).toBeCloseTo(255, 0);
    });

    it('should convert pure black (0,0,0) to 0', () => {
      const rgb = new Uint8Array([0, 0, 0]);
      const gray = rgbToGrayscale(rgb, 1, 1);
      expect(gray[0]).toBe(0);
    });

    it('should apply luminance formula Y = 0.299R + 0.587G + 0.114B', () => {
      const rgb = new Uint8Array([255, 0, 0]);
      const gray = rgbToGrayscale(rgb, 1, 1);
      expect(gray[0]).toBeCloseTo(0.299 * 255, 1);
    });

    it.each([
      { name: 'pure green', rgb: [0, 255, 0], expected: 0.587 * 255 },
      { name: 'pure blue', rgb: [0, 0, 255], expected: 0.114 * 255 },
    ])('should produce correct luminance for $name', ({ rgb, expected }) => {
      const gray = rgbToGrayscale(new Uint8Array(rgb), 1, 1);
      expect(gray[0]).toBeCloseTo(expected, 1);
    });
  });

  describe('output dimensions', () => {
    it('should return one value per pixel', () => {
      const rgb = new Uint8Array(12); // 2x2 * 3 channels
      const gray = rgbToGrayscale(rgb, 2, 2);
      expect(gray.length).toBe(4);
    });
  });
});

describe('rgbToYCrCb', () => {
  describe('channel output', () => {
    it('should return Y, Cr, and Cb channels of correct size', () => {
      const rgb = new Uint8Array([128, 128, 128]);
      const result = rgbToYCrCb(rgb, 1, 1);
      expect(result.y.length).toBe(1);
      expect(result.cr.length).toBe(1);
      expect(result.cb.length).toBe(1);
    });
  });

  describe('neutral gray conversion', () => {
    it('should produce Cr and Cb near 128 for gray pixels (R=G=B)', () => {
      const rgb = new Uint8Array([128, 128, 128]);
      const result = rgbToYCrCb(rgb, 1, 1);
      expect(result.cr[0]).toBeCloseTo(128, 0);
      expect(result.cb[0]).toBeCloseTo(128, 0);
    });

    it('should produce Y equal to the gray value for gray pixels', () => {
      const rgb = new Uint8Array([128, 128, 128]);
      const result = rgbToYCrCb(rgb, 1, 1);
      expect(result.y[0]).toBeCloseTo(128, 0);
    });
  });
});

describe('chwToHwc', () => {
  describe('layout conversion', () => {
    it('should interleave channels from planar to packed format', () => {
      // 2x2 image, 3 channels in CHW layout
      const chw = new Float32Array([
        10, 20, 30, 40,    // R channel
        50, 60, 70, 80,    // G channel
        90, 100, 110, 120, // B channel
      ]);
      const hwc = chwToHwc(chw, 3, 2, 2);
      // HWC: [R00,G00,B00, R01,G01,B01, ...]
      expect(hwc[0]).toBe(10);   // R00
      expect(hwc[1]).toBe(50);   // G00
      expect(hwc[2]).toBe(90);   // B00
      expect(hwc[3]).toBe(20);   // R01
      expect(hwc[4]).toBe(60);   // G01
    });
  });

  describe('value clamping', () => {
    it('should clamp negative values to 0', () => {
      const chw = new Float32Array([-10, 100]);
      const hwc = chwToHwc(chw, 1, 2, 1);
      expect(hwc[0]).toBe(0);
    });

    it('should clamp values above 255 to 255', () => {
      const chw = new Float32Array([100, 300]);
      const hwc = chwToHwc(chw, 1, 2, 1);
      expect(hwc[1]).toBe(255);
    });
  });
});

describe('hwcToChw', () => {
  describe('layout conversion', () => {
    it('should deinterleave packed pixels into planar channels', () => {
      const hwc = new Uint8Array([
        10, 50, 90,   // pixel (0,0)
        20, 60, 100,  // pixel (0,1)
        30, 70, 110,  // pixel (1,0)
        40, 80, 120,  // pixel (1,1)
      ]);
      const chw = hwcToChw(hwc, 3, 2, 2);
      // R channel
      expect(chw[0]).toBe(10);
      expect(chw[1]).toBe(20);
      expect(chw[2]).toBe(30);
      expect(chw[3]).toBe(40);
      // G channel
      expect(chw[4]).toBe(50);
      expect(chw[5]).toBe(60);
    });
  });

  describe('roundtrip', () => {
    it('should roundtrip hwcToChw -> chwToHwc without loss', () => {
      const original = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
      const chw = hwcToChw(original, 3, 2, 2);
      const result = chwToHwc(chw, 3, 2, 2);
      expect(Array.from(result)).toEqual(Array.from(original));
    });
  });
});
