import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the forensics functions with factory
const mockAdvancedDocumentForensics = vi.fn();
const mockBatchDocumentForensics = vi.fn();
const mockExtractDocumentFields = vi.fn();

vi.mock('./forensics.ts', () => ({
  advancedDocumentForensics: (...args: any[]) => mockAdvancedDocumentForensics(...args),
  extractDocumentFields: (...args: any[]) => mockExtractDocumentFields(...args),
  batchDocumentForensics: (...args: any[]) => mockBatchDocumentForensics(...args),
}));

import {
  handleAnalyze,
  handleBatch,
  handleExtractFields,
  type AnalyzeRequest,
  type BatchRequest,
  type ExtractFieldsRequest
} from './handler.ts';

describe('handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleAnalyze', () => {
    it('should successfully analyze a document', async () => {
      const mockResult = {
        success: true,
        method: 'advanced_document_forensics',
        ocr_engine: 'easyocr',
        device: 'auto',
        verdict: 'SUSPICIOUS',
        overall_score: 0.75,
        risk_level: 'medium',
        trufor: { global_score: 0.7, detection_score: 0.65 },
        image: { path: '/test/image.jpg', width: 800, height: 600 },
        ocr_analysis: { total_fields: 5, field_types_found: ['patient_name', 'amount'] },
        highest_risk_field: {
          type: 'amount',
          risk_weight: 0.8,
          text: '1000 USD',
          bbox: { x: 10, y: 20, width: 100, height: 30 },
          scores: { anomaly: 0.75, heatmap_mean: 0.3, heatmap_max: 0.6 }
        },
        fields: [],
        visualization_path: null,
        notes: ['Test note']
      };

      mockAdvancedDocumentForensics.mockResolvedValue(mockResult);

      const request: AnalyzeRequest = {
        image_path: '/test/image.jpg',
        market: 'VN',
        ocr_engine: 'easyocr',
        device: 'cpu',
        output_dir: '/output'
      };

      const result = await handleAnalyze(request);

      expect(result).toBe(mockResult);
      expect(mockAdvancedDocumentForensics).toHaveBeenCalledWith(
        '/test/image.jpg',
        'VN',
        '/output',
        'cpu',
        'easyocr'
      );
    });

    it('should use default values for optional parameters', async () => {
      const mockResult = {
        success: true,
        method: 'advanced_document_forensics',
        ocr_engine: 'easyocr',
        device: 'auto',
        verdict: 'NORMAL',
        overall_score: 0.2,
        risk_level: 'low',
        trufor: { global_score: 0.1, detection_score: null },
        image: { path: '/test/image.jpg', width: 800, height: 600 },
        ocr_analysis: { total_fields: 2, field_types_found: ['text'] },
        highest_risk_field: null,
        fields: [],
        visualization_path: null,
        notes: []
      };

      mockAdvancedDocumentForensics.mockResolvedValue(mockResult);

      const request: AnalyzeRequest = {
        image_path: '/test/image.jpg',
        market: 'TH'
      };

      const result = await handleAnalyze(request);

      expect(result).toBe(mockResult);
      expect(mockAdvancedDocumentForensics).toHaveBeenCalledWith(
        '/test/image.jpg',
        'TH',
        undefined,
        'auto',
        undefined
      );
    });

    it('should return error for missing image_path', async () => {
      const request: AnalyzeRequest = {
        market: 'VN'
        // image_path is missing
      };

      const result = await handleAnalyze(request);

      expect(result.success).toBe(false);
      expect(result.verdict).toBe('ERROR');
      expect(result.error).toBe('image_path is required');
      expect(mockAdvancedDocumentForensics).not.toHaveBeenCalled();
    });

    it('should return error for invalid market', async () => {
      const request: AnalyzeRequest = {
        image_path: '/test/image.jpg',
        market: 'INVALID'
      };

      const result = await handleAnalyze(request);

      expect(result.success).toBe(false);
      expect(result.verdict).toBe('ERROR');
      expect(result.error).toContain('Unknown market');
      expect(mockAdvancedDocumentForensics).not.toHaveBeenCalled();
    });

    it('should handle empty/null market', async () => {
      const request: AnalyzeRequest = {
        image_path: '/test/image.jpg',
        market: ''
      };

      const result = await handleAnalyze(request);

      expect(result.success).toBe(false);
      expect(result.verdict).toBe('ERROR');
      expect(result.error).toContain('market is required');
    });

    it('should preserve error shell structure', async () => {
      const request: AnalyzeRequest = {
        image_path: '/test/image.jpg',
        market: 'INVALID',
        ocr_engine: 'gemini',
        device: 'cuda'
      };

      const result = await handleAnalyze(request);

      expect(result).toMatchObject({
        success: false,
        method: 'advanced_document_forensics',
        ocr_engine: 'gemini',
        device: 'cuda',
        verdict: 'ERROR',
        overall_score: 0,
        risk_level: 'low',
        trufor: { global_score: 0, detection_score: null },
        image: { path: '', width: 0, height: 0 },
        ocr_analysis: { total_fields: 0, field_types_found: [] },
        highest_risk_field: null,
        fields: [],
        visualization_path: null,
        notes: []
      });
    });

    it('should handle analysis with Gemini engine', async () => {
      const mockResult = {
        success: true,
        method: 'advanced_document_forensics',
        ocr_engine: 'gemini',
        device: 'auto',
        verdict: 'TAMPERED',
        overall_score: 0.95,
        risk_level: 'high',
        trufor: { global_score: 0.9, detection_score: 0.88 },
        image: { path: '/test/image.jpg', width: 1024, height: 768 },
        ocr_analysis: { total_fields: 8, field_types_found: ['patient_name', 'amount', 'date'] },
        highest_risk_field: {
          type: 'patient_name',
          risk_weight: 1.0,
          text: 'Suspicious Name',
          bbox: { x: 50, y: 100, width: 200, height: 40 },
          scores: { anomaly: 0.95, heatmap_mean: 0.7, heatmap_max: 0.9 }
        },
        fields: [],
        visualization_path: '/output/summary.jpg',
        notes: ['High anomaly detected']
      };

      mockAdvancedDocumentForensics.mockResolvedValue(mockResult);

      const request: AnalyzeRequest = {
        image_path: '/test/image.jpg',
        market: 'HK',
        ocr_engine: 'gemini'
      };

      const result = await handleAnalyze(request);

      expect(result.verdict).toBe('TAMPERED');
      expect(result.ocr_engine).toBe('gemini');
      expect(mockAdvancedDocumentForensics).toHaveBeenCalledWith(
        '/test/image.jpg',
        'HK',
        undefined,
        'auto',
        'gemini'
      );
    });
  });

  describe('handleBatch', () => {
    it('should successfully process batch of documents', async () => {
      const mockResult = {
        success: true,
        total_images: 3,
        summary: {
          verdicts: { NORMAL: 2, SUSPICIOUS: 1, TAMPERED: 0, ERROR: 0 },
          avg_score: 0.35,
          max_score: 0.65,
          min_score: 0.2
        },
        results: [
          { image: '/test/img1.jpg', verdict: 'NORMAL', score: 0.2, fields: 5, highest_risk: null, visualization: '/output/img1_summary.jpg', error: null },
          { image: '/test/img2.jpg', verdict: 'SUSPICIOUS', score: 0.65, fields: 7, highest_risk: { type: 'amount', score: 0.65 }, visualization: '/output/img2_summary.jpg', error: null },
          { image: '/test/img3.jpg', verdict: 'NORMAL', score: 0.2, fields: 3, highest_risk: null, visualization: '/output/img3_summary.jpg', error: null }
        ],
        output_dir: '/output'
      };

      mockBatchDocumentForensics.mockResolvedValue(mockResult);

      const request: BatchRequest = {
        image_paths: ['/test/img1.jpg', '/test/img2.jpg', '/test/img3.jpg'],
        market: 'VN',
        device: 'gpu',
        concurrency: 2,
        output_dir: '/output'
      };

      const result = await handleBatch(request);

      expect(result).toBe(mockResult);
      expect(mockBatchDocumentForensics).toHaveBeenCalledWith(
        ['/test/img1.jpg', '/test/img2.jpg', '/test/img3.jpg'],
        'VN',
        '/output',
        'gpu',
        2
      );
    });

    it('should use default values for optional parameters', async () => {
      const mockResult = {
        success: true,
        total_images: 1,
        summary: {
          verdicts: { NORMAL: 1, SUSPICIOUS: 0, TAMPERED: 0, ERROR: 0 },
          avg_score: 0.1,
          max_score: 0.1,
          min_score: 0.1
        },
        results: [
          { image: '/test/img1.jpg', verdict: 'NORMAL', score: 0.1, fields: 2, highest_risk: null, visualization: null, error: null }
        ],
        output_dir: '/default/output'
      };

      mockBatchDocumentForensics.mockResolvedValue(mockResult);

      const request: BatchRequest = {
        image_paths: ['/test/img1.jpg'],
        market: 'TH'
      };

      const result = await handleBatch(request);

      expect(result).toBe(mockResult);
      expect(mockBatchDocumentForensics).toHaveBeenCalledWith(
        ['/test/img1.jpg'],
        'TH',
        undefined,
        'auto',
        3
      );
    });

    it('should return error for invalid market', async () => {
      const request: BatchRequest = {
        image_paths: ['/test/img1.jpg'],
        market: 'INVALID'
      };

      const result = await handleBatch(request);

      expect(result.success).toBe(false);
      expect(result.total_images).toBe(0);
      expect(result.results).toHaveLength(0);
      expect(mockBatchDocumentForensics).not.toHaveBeenCalled();
    });

    it('should return error for empty image_paths', async () => {
      const request: BatchRequest = {
        image_paths: [],
        market: 'VN'
      };

      const result = await handleBatch(request);

      expect(result.success).toBe(false);
      expect(result.total_images).toBe(0);
      expect(result.results).toHaveLength(0);
      expect(mockBatchDocumentForensics).not.toHaveBeenCalled();
    });

    it('should return error for missing image_paths', async () => {
      const request: BatchRequest = {
        image_paths: undefined as any,
        market: 'VN'
      };

      const result = await handleBatch(request);

      expect(result.success).toBe(false);
      expect(result.total_images).toBe(0);
      expect(result.results).toHaveLength(0);
      expect(mockBatchDocumentForensics).not.toHaveBeenCalled();
    });

    it('should handle batch processing with mixed results', async () => {
      const mockResult = {
        success: true,
        total_images: 2,
        summary: {
          verdicts: { NORMAL: 1, SUSPICIOUS: 0, TAMPERED: 0, ERROR: 1 },
          avg_score: 0.25,
          max_score: 0.25,
          min_score: 0.25
        },
        results: [
          { image: '/test/img1.jpg', verdict: 'NORMAL', score: 0.25, fields: 4, highest_risk: null, visualization: '/output/img1_summary.jpg', error: null },
          { image: '/test/img2.jpg', verdict: 'ERROR', score: 0, fields: 0, highest_risk: null, visualization: null, error: 'OCR extraction failed' }
        ],
        output_dir: '/output'
      };

      mockBatchDocumentForensics.mockResolvedValue(mockResult);

      const request: BatchRequest = {
        image_paths: ['/test/img1.jpg', '/test/img2.jpg'],
        market: 'ID'
      };

      const result = await handleBatch(request);

      expect(result.summary.verdicts.ERROR).toBe(1);
      expect(result.results[1]!.error).toContain('OCR extraction failed');
    });
  });

  describe('handleExtractFields', () => {
    it('should successfully extract fields', async () => {
      const mockResult = {
        success: true,
        engine: 'easyocr',
        document_type: 'auto',
        image: { path: '/test/document.jpg', width: 800, height: 600 },
        fields: [
          { label: 'patient_name', text: 'Alice Johnson', confidence: 0.96, bbox: { x: 20, y: 40, width: 150, height: 25 }, page_number: 1 },
          { label: 'amount', text: '2500 THB', confidence: 0.89, bbox: { x: 100, y: 200, width: 80, height: 20 }, page_number: 1 }
        ],
        total_fields: 2,
        processing_time_ms: 1500
      };

      mockExtractDocumentFields.mockResolvedValue(mockResult);

      const request: ExtractFieldsRequest = {
        image_path: '/test/document.jpg',
        market: 'TH',
        ocr_engine: 'easyocr'
      };

      const result = await handleExtractFields(request);

      expect(result).toBe(mockResult);
      expect(mockExtractDocumentFields).toHaveBeenCalledWith(
        '/test/document.jpg',
        'TH',
        'easyocr'
      );
    });

    it('should use default OCR engine when not specified', async () => {
      const mockResult = {
        success: true,
        engine: 'gemini',
        document_type: 'auto',
        image: { path: '/test/document.pdf', width: 0, height: 0 },
        fields: [],
        total_fields: 0,
        processing_time_ms: 800
      };

      mockExtractDocumentFields.mockResolvedValue(mockResult);

      const request: ExtractFieldsRequest = {
        image_path: '/test/document.pdf',
        market: 'HK'
      };

      const result = await handleExtractFields(request);

      expect(result).toBe(mockResult);
      expect(mockExtractDocumentFields).toHaveBeenCalledWith(
        '/test/document.pdf',
        'HK',
        undefined
      );
    });

    it('should return error for invalid market', async () => {
      const request: ExtractFieldsRequest = {
        image_path: '/test/document.jpg',
        market: 'INVALID',
        ocr_engine: 'gemini'
      };

      const result = await handleExtractFields(request);

      expect(result.success).toBe(false);
      expect(result.engine).toBe('gemini');
      expect(result.error).toContain('Unknown market');
      expect(result.fields).toHaveLength(0);
      expect(result.total_fields).toBe(0);
      expect(result.processing_time_ms).toBe(0);
      expect(mockExtractDocumentFields).not.toHaveBeenCalled();
    });

    it('should handle field extraction with Gemini engine', async () => {
      const mockResult = {
        success: true,
        engine: 'gemini',
        document_type: 'auto',
        image: { path: '/test/medical_report.pdf', width: 0, height: 0 },
        fields: [
          { label: 'diagnosis', text: 'A10.2 - Type 1 diabetes with kidney complications', confidence: 0.98, bbox: null, page_number: 1 },
          { label: 'doctor_name', text: 'Dr. Somchai Pattanachote', confidence: 0.94, bbox: null, page_number: 2 }
        ],
        total_fields: 2,
        processing_time_ms: 3200
      };

      mockExtractDocumentFields.mockResolvedValue(mockResult);

      const request: ExtractFieldsRequest = {
        image_path: '/test/medical_report.pdf',
        market: 'TH',
        ocr_engine: 'gemini'
      };

      const result = await handleExtractFields(request);

      expect(result.engine).toBe('gemini');
      expect(result.fields).toHaveLength(2);
      expect(result.fields[0]!.label).toBe('diagnosis');
      expect(result.fields[1]!.label).toBe('doctor_name');
    });

    it('should handle extraction failure', async () => {
      const mockResult = {
        success: false,
        engine: 'easyocr',
        document_type: 'auto',
        image: { path: '/test/corrupted.jpg', width: 0, height: 0 },
        fields: [],
        total_fields: 0,
        processing_time_ms: 0,
        error: 'File is corrupted or unreadable'
      };

      mockExtractDocumentFields.mockResolvedValue(mockResult);

      const request: ExtractFieldsRequest = {
        image_path: '/test/corrupted.jpg',
        market: 'VN'
      };

      const result = await handleExtractFields(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe('File is corrupted or unreadable');
      expect(result.fields).toHaveLength(0);
    });

    it('should handle market validation exceptions', async () => {
      const request: ExtractFieldsRequest = {
        image_path: '/test/document.jpg',
        market: '', // Empty market
        ocr_engine: 'easyocr'
      };

      const result = await handleExtractFields(request);

      expect(result.success).toBe(false);
      expect(result.engine).toBe('easyocr');
      expect(result.document_type).toBe('auto');
      expect(result.error).toContain('market is required');
      expect(mockExtractDocumentFields).not.toHaveBeenCalled();
    });
  });
});
