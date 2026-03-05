import { describe, it, expect } from 'vitest';
import { scoreFieldsAgainstHeatmap, computeVerdict } from '../extraction/field-scorer.ts';
import type { ExtractedField } from '../extraction/types.ts';
import type { FieldResult } from '../types.ts';

describe('scoreFieldsAgainstHeatmap', () => {
  describe('basic scoring', () => {
    it('should return empty array when given no fields', () => {
      const heatmap = new Float32Array([0, 0, 0, 0]);
      const result = scoreFieldsAgainstHeatmap([], heatmap, 2, 2, 100, 100);
      expect(result).toEqual([]);
    });

    it('should score all zeros when heatmap is uniformly zero', () => {
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

    it('should produce positive anomaly score when field overlaps high heatmap region', () => {
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

    it('should truncate text to 100 characters', () => {
      const heatmap = new Float32Array(4).fill(0);
      const longText = 'A'.repeat(200);
      const fields: ExtractedField[] = [{
        label: 'patient_name',
        text: longText,
        confidence: 0.9,
        bbox: { x: 0, y: 0, width: 100, height: 100 },
      }];

      const result = scoreFieldsAgainstHeatmap(fields, heatmap, 2, 2, 100, 100);
      expect(result[0]!.text).toHaveLength(100);
    });
  });

  describe('risk weight application', () => {
    it('should weight patient_name (1.0) higher than hospital_name (0.5)', () => {
      const heatmap = new Float32Array(4).fill(0.5);
      const fields: ExtractedField[] = [
        { label: 'patient_name', text: 'Test', confidence: 0.9, bbox: { x: 0, y: 0, width: 100, height: 100 } },
        { label: 'hospital_name', text: 'Hospital', confidence: 0.9, bbox: { x: 0, y: 0, width: 100, height: 100 } },
      ];

      const result = scoreFieldsAgainstHeatmap(fields, heatmap, 2, 2, 100, 100);
      expect(result[0]!.scores.anomaly).toBeGreaterThan(result[1]!.scores.anomaly);
    });

    it('should use unknown risk weight (0.0) for unrecognized labels', () => {
      const heatmap = new Float32Array(4).fill(0.8);
      const fields: ExtractedField[] = [{
        label: 'unknown',
        text: 'x',
        confidence: 0.9,
        bbox: { x: 0, y: 0, width: 100, height: 100 },
      }];

      const result = scoreFieldsAgainstHeatmap(fields, heatmap, 2, 2, 100, 100);
      expect(result[0]!.scores.anomaly).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should score zero anomaly when field has no bbox', () => {
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

    it('should round scores to 4 decimal places', () => {
      const heatmap = new Float32Array(4).fill(0.333);
      const fields: ExtractedField[] = [{
        label: 'patient_name',
        text: 'Test',
        confidence: 0.9,
        bbox: { x: 0, y: 0, width: 100, height: 100 },
      }];

      const result = scoreFieldsAgainstHeatmap(fields, heatmap, 2, 2, 100, 100);
      const decimals = result[0]!.scores.anomaly.toString().split('.')[1] ?? '';
      expect(decimals.length).toBeLessThanOrEqual(4);
    });
  });
});

describe('computeVerdict', () => {
  describe('verdict thresholds', () => {
    it('should return NORMAL for low anomaly scores', () => {
      const fields: FieldResult[] = [
        { type: 'patient_name', risk_weight: 1.0, text: 'Test', confidence: 0.9, bbox: null, scores: { anomaly: 0.1, heatmap_mean: 0.1, heatmap_max: 0.1 } },
        { type: 'amount', risk_weight: 0.9, text: '100', confidence: 0.9, bbox: null, scores: { anomaly: 0.05, heatmap_mean: 0.05, heatmap_max: 0.05 } },
      ];

      const result = computeVerdict(fields);
      expect(result.verdict).toBe('NORMAL');
      expect(result.risk_level).toBe('low');
    });

    it('should return SUSPICIOUS when max key field score is between 0.45 and 0.50', () => {
      const fields: FieldResult[] = [
        { type: 'patient_name', risk_weight: 1.0, text: 'Test', confidence: 0.9, bbox: null, scores: { anomaly: 0.47, heatmap_mean: 0.4, heatmap_max: 0.5 } },
        { type: 'date', risk_weight: 0.7, text: '2024', confidence: 0.9, bbox: null, scores: { anomaly: 0.1, heatmap_mean: 0.1, heatmap_max: 0.1 } },
      ];

      const result = computeVerdict(fields);
      expect(result.verdict).toBe('SUSPICIOUS');
    });

    it('should return TAMPERED when max key field score >= 0.50', () => {
      const fields: FieldResult[] = [
        { type: 'amount', risk_weight: 0.9, text: '99999', confidence: 0.9, bbox: null, scores: { anomaly: 0.7, heatmap_mean: 0.6, heatmap_max: 0.8 } },
        { type: 'hospital_name', risk_weight: 0.5, text: 'Hospital', confidence: 0.9, bbox: null, scores: { anomaly: 0.1, heatmap_mean: 0.1, heatmap_max: 0.1 } },
      ];

      const result = computeVerdict(fields);
      expect(result.verdict).toBe('TAMPERED');
      expect(result.risk_level).toBe('high');
    });
  });

  describe('overall score formula', () => {
    it('should compute overall = max*0.6 + mean*0.4 for key fields', () => {
      const fields: FieldResult[] = [
        { type: 'patient_name', risk_weight: 1.0, text: 'A', confidence: 0.9, bbox: null, scores: { anomaly: 0.4, heatmap_mean: 0, heatmap_max: 0 } },
        { type: 'amount', risk_weight: 0.9, text: 'B', confidence: 0.9, bbox: null, scores: { anomaly: 0.2, heatmap_mean: 0, heatmap_max: 0 } },
      ];

      const result = computeVerdict(fields);
      // key scores = [0.4, 0.2], max=0.4, mean=0.3
      // overall = 0.4*0.6 + 0.3*0.4 = 0.24 + 0.12 = 0.36
      expect(result.overall_score).toBeCloseTo(0.36, 4);
    });

    it('should fall back to all scores when no key fields present', () => {
      const fields: FieldResult[] = [
        { type: 'hospital_name', risk_weight: 0.5, text: 'Hospital', confidence: 0.9, bbox: null, scores: { anomaly: 0.3, heatmap_mean: 0.3, heatmap_max: 0.3 } },
        { type: 'stamp', risk_weight: 0.6, text: 'Stamp', confidence: 0.9, bbox: null, scores: { anomaly: 0.2, heatmap_mean: 0.2, heatmap_max: 0.2 } },
      ];

      const result = computeVerdict(fields);
      // all scores = [0.3, 0.2], max=0.3, mean=0.25
      // overall = 0.3*0.6 + 0.25*0.4 = 0.18 + 0.10 = 0.28
      expect(result.verdict).toBe('NORMAL');
      expect(result.overall_score).toBeCloseTo(0.28, 4);
    });
  });

  describe('edge cases', () => {
    it('should return NORMAL with score 0 for empty fields', () => {
      const result = computeVerdict([]);
      expect(result.verdict).toBe('NORMAL');
      expect(result.overall_score).toBe(0);
    });

    it('should use only key field scores when both key and non-key fields exist', () => {
      const fields: FieldResult[] = [
        { type: 'patient_name', risk_weight: 1.0, text: 'A', confidence: 0.9, bbox: null, scores: { anomaly: 0.1, heatmap_mean: 0, heatmap_max: 0 } },
        { type: 'hospital_name', risk_weight: 0.5, text: 'B', confidence: 0.9, bbox: null, scores: { anomaly: 0.9, heatmap_mean: 0, heatmap_max: 0 } },
      ];

      const result = computeVerdict(fields);
      // key scores = [0.1] (only patient_name), ignores hospital_name
      // overall = 0.1*0.6 + 0.1*0.4 = 0.1
      expect(result.overall_score).toBeCloseTo(0.1, 4);
    });
  });

  describe('risk level classification', () => {
    it.each([
      { overall: 0.1, expected: 'low' },
      { overall: 0.25, expected: 'low' },
      { overall: 0.30, expected: 'medium' },
      { overall: 0.35, expected: 'medium' },
      { overall: 0.50, expected: 'high' },
    ] as const)('should classify overall_score $overall as $expected risk', ({ overall, expected }) => {
      // Create a single key field with anomaly score that produces the desired overall
      // overall = anomaly*0.6 + anomaly*0.4 = anomaly (single field: max=mean=anomaly)
      const fields: FieldResult[] = [
        { type: 'patient_name', risk_weight: 1.0, text: 'X', confidence: 0.9, bbox: null, scores: { anomaly: overall, heatmap_mean: 0, heatmap_max: 0 } },
      ];

      const result = computeVerdict(fields);
      expect(result.risk_level).toBe(expected);
    });
  });
});
