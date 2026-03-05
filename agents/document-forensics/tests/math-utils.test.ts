import { describe, it, expect } from 'vitest';
import { mean, max, min, std, median, mad, histogram, clamp } from '../utils/math-utils.ts';

describe('mean', () => {
  it('should return 0 for empty array', () => {
    expect(mean(new Float32Array([]))).toBe(0);
  });

  it('should compute arithmetic mean', () => {
    expect(mean(new Float32Array([1, 2, 3, 4, 5]))).toBeCloseTo(3.0);
  });

  it('should return the element itself for single-element array', () => {
    expect(mean(new Float32Array([42]))).toBe(42);
  });

  it('should handle negative values', () => {
    expect(mean(new Float32Array([-2, 2]))).toBeCloseTo(0);
  });
});

describe('max', () => {
  it('should return 0 for empty array', () => {
    expect(max(new Float32Array([]))).toBe(0);
  });

  it('should find the maximum value', () => {
    expect(max(new Float32Array([1, 5, 3, 2, 4]))).toBe(5);
  });

  it('should handle all-negative values', () => {
    expect(max(new Float32Array([-5, -3, -1]))).toBe(-1);
  });
});

describe('min', () => {
  it('should return 0 for empty array', () => {
    expect(min(new Float32Array([]))).toBe(0);
  });

  it('should find the minimum value', () => {
    expect(min(new Float32Array([3, 1, 4, 1, 5]))).toBe(1);
  });

  it('should handle all-negative values', () => {
    expect(min(new Float32Array([-5, -3, -1]))).toBe(-5);
  });
});

describe('std', () => {
  it('should return 0 for empty array', () => {
    expect(std(new Float32Array([]))).toBe(0);
  });

  it('should return 0 for constant values', () => {
    expect(std(new Float32Array([5, 5, 5, 5]))).toBeCloseTo(0);
  });

  it('should compute population standard deviation', () => {
    // std of [1,2,3,4,5] = sqrt(2) ≈ 1.4142
    expect(std(new Float32Array([1, 2, 3, 4, 5]))).toBeCloseTo(Math.sqrt(2), 3);
  });

  it('should return 0 for single element', () => {
    expect(std(new Float32Array([7]))).toBe(0);
  });
});

describe('median', () => {
  it('should return 0 for empty array', () => {
    expect(median(new Float32Array([]))).toBe(0);
  });

  it('should return middle value for odd-length array', () => {
    expect(median(new Float32Array([3, 1, 2]))).toBe(2);
  });

  it('should return average of two middle values for even-length array', () => {
    expect(median(new Float32Array([1, 2, 3, 4]))).toBe(2.5);
  });

  it('should handle unsorted input', () => {
    expect(median(new Float32Array([5, 1, 3]))).toBe(3);
  });
});

describe('mad', () => {
  it('should return 0 for empty array', () => {
    expect(mad(new Float32Array([]))).toBe(0);
  });

  it('should return 0 for constant values', () => {
    expect(mad(new Float32Array([3, 3, 3]))).toBe(0);
  });

  it('should compute MAD = median(|x - median(x)|) / 0.6745', () => {
    // [1, 2, 3, 4, 5] → median=3, deviations=[2,1,0,1,2], median_dev=1
    // MAD = 1 / 0.6745 ≈ 1.4826
    expect(mad(new Float32Array([1, 2, 3, 4, 5]))).toBeCloseTo(1 / 0.6745, 2);
  });
});

describe('histogram', () => {
  it('should distribute values into correct bins', () => {
    const hist = histogram(new Float32Array([0.1, 0.3, 0.5, 0.7, 0.9]), 5, 0, 1);
    expect(hist.length).toBe(5);
    const total = Array.from(hist).reduce((a, b) => a + b, 0);
    expect(total).toBe(5);
  });

  it('should return empty bins for zero range', () => {
    const hist = histogram(new Float32Array([1, 1, 1]), 3, 1, 1);
    const total = Array.from(hist).reduce((a, b) => a + b, 0);
    expect(total).toBe(0);
  });

  it('should place boundary value in last bin', () => {
    // Value exactly at maxVal should go in the last bin (clamped by Math.min)
    const hist = histogram(new Float32Array([1.0]), 5, 0, 1);
    expect(hist[4]).toBe(1);
  });
});

describe('clamp', () => {
  it.each([
    { val: -5, lo: 0, hi: 10, expected: 0, desc: 'below range' },
    { val: 15, lo: 0, hi: 10, expected: 10, desc: 'above range' },
    { val: 5, lo: 0, hi: 10, expected: 5, desc: 'within range' },
    { val: 0, lo: 0, hi: 10, expected: 0, desc: 'at lower bound' },
    { val: 10, lo: 0, hi: 10, expected: 10, desc: 'at upper bound' },
  ])('should return $expected when value is $desc ($val in [$lo, $hi])', ({ val, lo, hi, expected }) => {
    expect(clamp(val, lo, hi)).toBe(expected);
  });
});
