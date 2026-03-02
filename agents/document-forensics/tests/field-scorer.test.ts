import { describe, it, expect } from 'vitest';
import { scoreFieldsAgainstHeatmap, computeVerdict } from '../extraction/field-scorer.ts';
import type { ExtractedField } from '../extraction/types.ts';
import type { FieldResult } from '../types.ts';

describe('field-scorer', () => {
  describe('scoreFieldsAgainstHeatmap', () => {
    it('returns empty array for no fields', () => {
      const heatmap = new Float32Array([0, 0, 0, 0]);
      const result = scoreFieldsAgainstHeatmap([], heatmap, 2, 2, 100, 100);
      expect(result).toEqual([]);
    });

    it('scores field against uniform low heatmap', () => {
      // 4x4 heatmap with all zeros
      const heatmap = new Float32Array(16).fill(0);
      const fields: ExtractedField[] = [{
        label: 'patient_name',
        text: 'John Doe',
        confidence: 0.95,
        bbox: { x: 0, y: 0, width: 50, height: 50 },
      }];

      const result = scoreFieldsAgainstHeatmap(fields, heatmap, 4, 4, 100, 100);
      expect(result).toHaveLength(1);
      expect(result[0]!.scores.anomaly).toBe(0);
      expect(result[0]!.scores.heatmap_mean).toBe(0);
      expect(result[0]!.scores.heatmap_max).toBe(0);
    });

    it('scores field against high heatmap region', () => {
      // 4x4 heatmap with 1.0 in top-left quadrant
      const heatmap = new Float32Array(16);
      heatmap[0] = 1.0; heatmap[1] = 1.0;
      heatmap[4] = 1.0; heatmap[5] = 1.0;

      const fields: ExtractedField[] = [{
        label: 'amount',
        text: '1000',
        confidence: 0.9,
        bbox: { x: 0, y: 0, width: 50, height: 50 },
      }];

      const result = scoreFieldsAgainstHeatmap(fields, heatmap, 4, 4, 100, 100);
      expect(result).toHaveLength(1);
      expect(result[0]!.scores.anomaly).toBeGreaterThan(0);
      expect(result[0]!.scores.heatmap_max).toBeGreaterThan(0);
    });

    it('applies risk weights correctly', () => {
      // Uniform heatmap
      const heatmap = new Float32Array(4).fill(0.5);

      const fields: ExtractedField[] = [
        { label: 'patient_name', text: 'Test', confidence: 0.9, bbox: { x: 0, y: 0, width: 100, height: 100 } },
        { label: 'hospital_name', text: 'Hospital', confidence: 0.9, bbox: { x: 0, y: 0, width: 100, height: 100 } },
      ];

      const result = scoreFieldsAgainstHeatmap(fields, heatmap, 2, 2, 100, 100);
      // patient_name has risk 1.0, hospital_name has risk 0.5
      expect(result[0]!.scores.anomaly).toBeGreaterThan(result[1]!.scores.anomaly);
    });

    it('handles field without bbox', () => {
      const heatmap = new Float32Array(4).fill(0.5);
      const fields: ExtractedField[] = [{
        label: 'date',
        text: '2024-01-01',
        confidence: 0.9,
        bbox: null,
      }];

      const result = scoreFieldsAgainstHeatmap(fields, heatmap, 2, 2, 100, 100);
      expect(result[0]!.scores.anomaly).toBe(0);
    });
  });

  describe('computeVerdict', () => {
    it('returns NORMAL for low scores', () => {
      const fields: FieldResult[] = [
        { type: 'patient_name', risk_weight: 1.0, text: 'Test', confidence: 0.9, bbox: null, scores: { anomaly: 0.1, heatmap_mean: 0.1, heatmap_max: 0.1 } },
        { type: 'amount', risk_weight: 0.9, text: '100', confidence: 0.9, bbox: null, scores: { anomaly: 0.05, heatmap_mean: 0.05, heatmap_max: 0.05 } },
      ];

      const result = computeVerdict(fields);
      expect(result.verdict).toBe('NORMAL');
      expect(result.risk_level).toBe('low');
    });

    it('returns SUSPICIOUS for moderate key field scores', () => {
      const fields: FieldResult[] = [
        { type: 'patient_name', risk_weight: 1.0, text: 'Test', confidence: 0.9, bbox: null, scores: { anomaly: 0.47, heatmap_mean: 0.4, heatmap_max: 0.5 } },
        { type: 'date', risk_weight: 0.7, text: '2024', confidence: 0.9, bbox: null, scores: { anomaly: 0.1, heatmap_mean: 0.1, heatmap_max: 0.1 } },
      ];

      const result = computeVerdict(fields);
      expect(result.verdict).toBe('SUSPICIOUS');
    });

    it('returns TAMPERED for high key field scores', () => {
      const fields: FieldResult[] = [
        { type: 'amount', risk_weight: 0.9, text: '99999', confidence: 0.9, bbox: null, scores: { anomaly: 0.7, heatmap_mean: 0.6, heatmap_max: 0.8 } },
        { type: 'hospital_name', risk_weight: 0.5, text: 'Hospital', confidence: 0.9, bbox: null, scores: { anomaly: 0.1, heatmap_mean: 0.1, heatmap_max: 0.1 } },
      ];

      const result = computeVerdict(fields);
      expect(result.verdict).toBe('TAMPERED');
      expect(result.risk_level).toBe('high');
    });

    it('handles empty fields', () => {
      const result = computeVerdict([]);
      expect(result.verdict).toBe('NORMAL');
      expect(result.overall_score).toBe(0);
    });

    it('handles only non-key fields', () => {
      const fields: FieldResult[] = [
        { type: 'hospital_name', risk_weight: 0.5, text: 'Hospital', confidence: 0.9, bbox: null, scores: { anomaly: 0.3, heatmap_mean: 0.3, heatmap_max: 0.3 } },
        { type: 'stamp', risk_weight: 0.6, text: 'Stamp', confidence: 0.9, bbox: null, scores: { anomaly: 0.2, heatmap_mean: 0.2, heatmap_max: 0.2 } },
      ];

      const result = computeVerdict(fields);
      // With no key fields, overall = mean of all scores
      expect(result.verdict).toBe('NORMAL');
      expect(result.overall_score).toBeCloseTo(0.25, 2);
    });
  });
});
