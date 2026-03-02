import { describe, it, expect } from 'vitest';
import { mean, max, min, std, median, mad, histogram, clamp } from '../utils/math-utils.ts';

describe('math-utils', () => {
  describe('mean', () => {
    it('returns 0 for empty array', () => {
      expect(mean(new Float32Array([]))).toBe(0);
    });

    it('computes mean correctly', () => {
      expect(mean(new Float32Array([1, 2, 3, 4, 5]))).toBeCloseTo(3.0);
    });

    it('handles single element', () => {
      expect(mean(new Float32Array([42]))).toBe(42);
    });
  });

  describe('max', () => {
    it('returns 0 for empty array', () => {
      expect(max(new Float32Array([]))).toBe(0);
    });

    it('finds max correctly', () => {
      expect(max(new Float32Array([1, 5, 3, 2, 4]))).toBe(5);
    });

    it('handles negative values', () => {
      expect(max(new Float32Array([-5, -3, -1]))).toBe(-1);
    });
  });

  describe('min', () => {
    it('returns 0 for empty array', () => {
      expect(min(new Float32Array([]))).toBe(0);
    });

    it('finds min correctly', () => {
      expect(min(new Float32Array([3, 1, 4, 1, 5]))).toBe(1);
    });
  });

  describe('std', () => {
    it('returns 0 for empty array', () => {
      expect(std(new Float32Array([]))).toBe(0);
    });

    it('returns 0 for constant array', () => {
      expect(std(new Float32Array([5, 5, 5, 5]))).toBeCloseTo(0);
    });

    it('computes standard deviation correctly', () => {
      // std of [1,2,3,4,5] = sqrt(2) ≈ 1.4142
      expect(std(new Float32Array([1, 2, 3, 4, 5]))).toBeCloseTo(Math.sqrt(2), 3);
    });
  });

  describe('median', () => {
    it('returns 0 for empty array', () => {
      expect(median(new Float32Array([]))).toBe(0);
    });

    it('computes median for odd-length array', () => {
      expect(median(new Float32Array([3, 1, 2]))).toBe(2);
    });

    it('computes median for even-length array', () => {
      expect(median(new Float32Array([1, 2, 3, 4]))).toBe(2.5);
    });
  });

  describe('mad', () => {
    it('returns 0 for empty array', () => {
      expect(mad(new Float32Array([]))).toBe(0);
    });

    it('returns 0 for constant array', () => {
      expect(mad(new Float32Array([3, 3, 3]))).toBe(0);
    });
  });

  describe('histogram', () => {
    it('distributes values into bins', () => {
      const hist = histogram(new Float32Array([0.1, 0.3, 0.5, 0.7, 0.9]), 5, 0, 1);
      expect(hist.length).toBe(5);
      // Each value should land in a different bin
      const total = Array.from(hist).reduce((a, b) => a + b, 0);
      expect(total).toBe(5);
    });

    it('handles zero range', () => {
      const hist = histogram(new Float32Array([1, 1, 1]), 3, 1, 1);
      const total = Array.from(hist).reduce((a, b) => a + b, 0);
      expect(total).toBe(0); // zero range → no bins filled
    });
  });

  describe('clamp', () => {
    it('clamps value below range', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
    });

    it('clamps value above range', () => {
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('returns value within range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });
  });
});
