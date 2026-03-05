import { describe, it, expect } from 'vitest';
import { applyJetColormap } from '../utils/heatmap.ts';

describe('applyJetColormap', () => {
  describe('output dimensions', () => {
    it('should return RGB buffer with 3 bytes per pixel', () => {
      const heatmap = new Float32Array([0, 0.25, 0.5, 0.75, 1.0, 0.5]);
      const rgb = applyJetColormap(heatmap, 3, 2);
      // 3*2 pixels * 3 channels = 18 bytes
      expect(rgb.length).toBe(18);
    });

    it('should handle single pixel input', () => {
      const heatmap = new Float32Array([0.5]);
      const rgb = applyJetColormap(heatmap, 1, 1);
      expect(rgb.length).toBe(3);
    });
  });

  describe('colormap behavior', () => {
    it('should produce identical colors for uniform input', () => {
      const heatmap = new Float32Array([0, 0, 0, 0]);
      const rgb = applyJetColormap(heatmap, 2, 2);
      // All same value → same normalized index → same color
      expect(rgb[0]).toBe(rgb[3]);
      expect(rgb[1]).toBe(rgb[4]);
      expect(rgb[2]).toBe(rgb[5]);
    });

    it('should produce different colors for min vs max values', () => {
      const heatmap = new Float32Array([0, 1]);
      const rgb = applyJetColormap(heatmap, 2, 1);
      const pixel0 = [rgb[0], rgb[1], rgb[2]];
      const pixel1 = [rgb[3], rgb[4], rgb[5]];
      expect(pixel0).not.toEqual(pixel1);
    });

    it('should map low values to blue end of JET spectrum', () => {
      // min=0, max=1 → pixel at 0 maps to idx 0 (deep blue)
      const heatmap = new Float32Array([0, 1]);
      const rgb = applyJetColormap(heatmap, 2, 1);
      // JET idx 0: R≈0, G=0, B high (blue)
      expect(rgb[2]).toBeGreaterThan(rgb[0]!); // B > R for blue end
    });

    it('should map high values to red end of JET spectrum', () => {
      const heatmap = new Float32Array([0, 1]);
      const rgb = applyJetColormap(heatmap, 2, 1);
      // JET idx 255: R high, G=0, B=0 (red)
      expect(rgb[3]).toBeGreaterThan(rgb[5]!); // R > B for red end
    });
  });

  describe('normalization', () => {
    it('should normalize values relative to min/max in the input', () => {
      // [10, 20] should look identical to [0, 1] after normalization
      const a = applyJetColormap(new Float32Array([0, 1]), 2, 1);
      const b = applyJetColormap(new Float32Array([10, 20]), 2, 1);
      expect(Array.from(a)).toEqual(Array.from(b));
    });
  });
});
