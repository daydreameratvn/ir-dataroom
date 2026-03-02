import { describe, it, expect } from 'vitest';
import { applyJetColormap } from '../utils/heatmap.ts';

describe('heatmap', () => {
  describe('applyJetColormap', () => {
    it('returns correct size RGB buffer', () => {
      const heatmap = new Float32Array([0, 0.25, 0.5, 0.75, 1.0, 0.5]);
      const rgb = applyJetColormap(heatmap, 3, 2);
      // 3*2 pixels * 3 channels = 18 bytes
      expect(rgb.length).toBe(18);
    });

    it('maps low values to blue (JET colormap)', () => {
      // All zeros → min of range → should be blue-ish
      const heatmap = new Float32Array([0, 0, 0, 0]);
      const rgb = applyJetColormap(heatmap, 2, 2);
      // With constant input, all map to index 0 (deep blue)
      // All pixels should have same color
      expect(rgb[0]).toBe(rgb[3]);
      expect(rgb[1]).toBe(rgb[4]);
      expect(rgb[2]).toBe(rgb[5]);
    });

    it('handles single pixel', () => {
      const heatmap = new Float32Array([0.5]);
      const rgb = applyJetColormap(heatmap, 1, 1);
      expect(rgb.length).toBe(3);
      // Single pixel with range=0, maps to idx 0
    });

    it('produces different colors for different values', () => {
      const heatmap = new Float32Array([0, 1]);
      const rgb = applyJetColormap(heatmap, 2, 1);
      // First pixel (0) and second pixel (1) should be different
      const pixel0 = [rgb[0], rgb[1], rgb[2]];
      const pixel1 = [rgb[3], rgb[4], rgb[5]];
      expect(pixel0).not.toEqual(pixel1);
    });
  });
});
