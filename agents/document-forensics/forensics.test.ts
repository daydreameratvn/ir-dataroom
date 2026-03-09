import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MarketCode } from './extraction/market-config.ts';

// Setup mocks before imports
const mockExecFile = vi.fn();
const mockMkdirSync = vi.fn();
const mockExistsSync = vi.fn().mockReturnValue(true);
const mockGeminiExtractor = vi.fn();
const mockEasyOCRExtractor = vi.fn();
const mockGetOcrEngine = vi.fn().mockReturnValue('easyocr');
const mockEnsureOutputDir = vi.fn().mockReturnValue('/mock/output');
const mockScoreFieldsAgainstHeatmap = vi.fn();
const mockComputeVerdict = vi.fn();
const mockGenerateForensicsSummary = vi.fn();

vi.mock('node:child_process', () => ({
  execFile: (...args: any[]) => mockExecFile(...args),
}));

vi.mock('node:fs', () => ({
  mkdirSync: (...args: any[]) => mockMkdirSync(...args),
  existsSync: (...args: any[]) => mockExistsSync(...args),
  writeFileSync: vi.fn(),
}));

vi.mock('./extraction/gemini-extractor.ts', () => {
  return {
    GeminiExtractor: vi.fn().mockImplementation(function (this: any, ...args: any[]) {
      mockGeminiExtractor(...args);
      Object.assign(this, mockGeminiExtractor._instance);
    }),
  };
});

vi.mock('./extraction/easyocr-extractor.ts', () => {
  return {
    EasyOCRExtractor: vi.fn().mockImplementation(function (this: any, ...args: any[]) {
      mockEasyOCRExtractor(...args);
      Object.assign(this, mockEasyOCRExtractor._instance);
    }),
  };
});

vi.mock('./config.ts', () => ({
  PYTHON_PROJECT_PATH: '/mock/python/path',
  PYTHON_BRIDGE_TIMEOUT: 30000,
  getOcrEngine: (...args: any[]) => mockGetOcrEngine(...args),
  ensureOutputDir: (...args: any[]) => mockEnsureOutputDir(...args),
}));

vi.mock('./extraction/field-scorer.ts', () => ({
  scoreFieldsAgainstHeatmap: (...args: any[]) => mockScoreFieldsAgainstHeatmap(...args),
  computeVerdict: (...args: any[]) => mockComputeVerdict(...args),
}));

vi.mock('./utils/forensics-visualizer.ts', () => ({
  generateForensicsSummary: (...args: any[]) => mockGenerateForensicsSummary(...args),
}));

import {
  advancedDocumentForensics,
  extractDocumentFields,
  batchDocumentForensics
} from './forensics.ts';

describe('forensics', () => {
  let mockExtractorInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock extractor instance
    mockExtractorInstance = {
      extract: vi.fn(),
    };

    mockGeminiExtractor._instance = mockExtractorInstance;
    mockEasyOCRExtractor._instance = mockExtractorInstance;

    // Default mock implementations
    mockGetOcrEngine.mockReturnValue('easyocr');
    mockEnsureOutputDir.mockReturnValue('/mock/output');
    mockMkdirSync.mockImplementation(() => {});
  });

  describe('advancedDocumentForensics', () => {
    it('should successfully process document with EasyOCR', async () => {
      mockExtractorInstance.extract.mockResolvedValue({
        fields: [
          {
            label: 'patient_name',
            text: 'John Doe',
            confidence: 0.95,
            bbox: { x: 10, y: 20, width: 100, height: 30 },
            page_number: 1
          }
        ],
        engine: 'easyocr',
        image_width: 800,
        image_height: 600,
        processing_time_ms: 1500,
        usage: { api_calls: 0 }
      });

      const mockTruForOutput = JSON.stringify({
        success: true,
        global_score: 0.75,
        detection_score: 0.68,
        heatmap_b64: Buffer.from(new Float32Array([0.1, 0.2, 0.3, 0.4])).toString('base64'),
        width: 2,
        height: 2,
        device: 'cpu',
        cuda_available: false,
        gpu_name: null,
        torch_version: '2.0.0'
      });

      mockExecFile.mockImplementation((cmd: any, args: any, options: any, callback: any) => {
        callback(null, { stdout: mockTruForOutput });
      });

      mockScoreFieldsAgainstHeatmap.mockReturnValue([
        {
          type: 'patient_name',
          risk_weight: 1.0,
          text: 'John Doe',
          confidence: 0.95,
          bbox: { x: 10, y: 20, width: 100, height: 30 },
          scores: { anomaly: 0.65, heatmap_mean: 0.25, heatmap_max: 0.45 }
        }
      ]);

      mockComputeVerdict.mockReturnValue({
        verdict: 'SUSPICIOUS',
        overall_score: 0.65,
        risk_level: 'medium'
      });

      mockGenerateForensicsSummary.mockResolvedValue(Buffer.from('mock-summary-image'));

      const result = await advancedDocumentForensics('/test/image.jpg', 'VN');

      expect(result.success).toBe(true);
      expect(result.method).toBe('advanced_document_forensics');
      expect(result.ocr_engine).toBe('easyocr');
      expect(result.verdict).toBe('SUSPICIOUS');
      expect(result.overall_score).toBe(0.65);
      expect(result.risk_level).toBe('medium');
      expect(result.trufor.global_score).toBe(0.75);
      expect(result.trufor.detection_score).toBe(0.68);
      expect(result.image.width).toBe(800);
      expect(result.image.height).toBe(600);
      expect(result.fields).toHaveLength(1);
      expect(result.heatmap_b64).toBeDefined();
    });

    it('should successfully process document with Gemini', async () => {
      mockGetOcrEngine.mockReturnValue('gemini');

      mockExtractorInstance.extract.mockResolvedValue({
        fields: [
          {
            label: 'amount',
            text: '1000 VND',
            confidence: 0.88,
            bbox: { x: 50, y: 100, width: 150, height: 25 },
            page_number: 1
          }
        ],
        engine: 'gemini',
        image_width: 800,
        image_height: 600,
        processing_time_ms: 2500,
        usage: { api_calls: 2, cost_usd: 0.05 }
      });

      const mockTruForOutput = JSON.stringify({
        success: true,
        global_score: 0.45,
        detection_score: null,
        heatmap_b64: Buffer.from(new Float32Array([0.1, 0.2])).toString('base64'),
        width: 1,
        height: 2
      });

      mockExecFile.mockImplementation((cmd: any, args: any, options: any, callback: any) => {
        callback(null, { stdout: mockTruForOutput });
      });

      mockScoreFieldsAgainstHeatmap.mockReturnValue([
        {
          type: 'amount',
          risk_weight: 0.8,
          text: '1000 VND',
          confidence: 0.88,
          bbox: { x: 50, y: 100, width: 150, height: 25 },
          scores: { anomaly: 0.25, heatmap_mean: 0.15, heatmap_max: 0.35 }
        }
      ]);

      mockComputeVerdict.mockReturnValue({
        verdict: 'NORMAL',
        overall_score: 0.25,
        risk_level: 'low'
      });

      mockGenerateForensicsSummary.mockResolvedValue(Buffer.from('mock-summary'));

      const result = await advancedDocumentForensics('/test/image.jpg', 'TH', undefined, 'auto', 'gemini');

      expect(result.success).toBe(true);
      expect(result.ocr_engine).toBe('gemini');
      expect(result.verdict).toBe('NORMAL');
      expect(mockGeminiExtractor).toHaveBeenCalledWith('TH');
    });

    it('should handle OCR extraction failure', async () => {
      mockExtractorInstance.extract.mockRejectedValue(new Error('OCR failed'));

      const result = await advancedDocumentForensics('/test/image.jpg', 'VN');

      expect(result.success).toBe(false);
      expect(result.verdict).toBe('ERROR');
      expect(result.error).toContain('OCR extraction failed');
      expect(result.overall_score).toBe(0);
    });

    it('should handle TruFor failure gracefully', async () => {
      mockExtractorInstance.extract.mockResolvedValue({
        fields: [
          {
            label: 'text',
            text: 'Sample text',
            confidence: 0.9,
            bbox: null,
            page_number: 1
          }
        ],
        engine: 'easyocr',
        image_width: 800,
        image_height: 600,
        processing_time_ms: 1000,
        usage: { api_calls: 0 }
      });

      const mockTruForError = JSON.stringify({
        success: false,
        global_score: 0,
        detection_score: null,
        heatmap_b64: null,
        width: 0,
        height: 0,
        error: 'CUDA not available'
      });

      mockExecFile.mockImplementation((cmd: any, args: any, options: any, callback: any) => {
        callback(null, { stdout: mockTruForError });
      });

      mockComputeVerdict.mockReturnValue({
        verdict: 'NORMAL',
        overall_score: 0,
        risk_level: 'low'
      });

      const result = await advancedDocumentForensics('/test/image.jpg', 'VN');

      expect(result.success).toBe(true);
      expect(result.verdict).toBe('NORMAL');
      expect(result.trufor.global_score).toBe(0);
      expect(result.notes.some((note: string) => note.includes('TruFor unavailable'))).toBe(true);
    });

    it('should handle invalid market code', async () => {
      await expect(advancedDocumentForensics('/test/image.jpg', 'INVALID')).rejects.toThrow();
    });

    it('should use custom device parameter', async () => {
      mockExtractorInstance.extract.mockResolvedValue({
        fields: [],
        engine: 'easyocr',
        image_width: 800,
        image_height: 600,
        processing_time_ms: 1000,
        usage: { api_calls: 0 }
      });

      mockExecFile.mockImplementation((cmd: any, args: any, options: any, callback: any) => {
        const mockOutput = JSON.stringify({
          success: true,
          global_score: 0.5,
          detection_score: null,
          heatmap_b64: null,
          width: 0,
          height: 0,
          device: 'cuda'
        });
        callback(null, { stdout: mockOutput });
      });

      mockComputeVerdict.mockReturnValue({
        verdict: 'NORMAL',
        overall_score: 0,
        risk_level: 'low'
      });

      const result = await advancedDocumentForensics('/test/image.jpg', 'VN', undefined, 'cuda');

      expect(result.device).toBe('cuda');
    });

    it('should handle visualization generation failure', async () => {
      mockExtractorInstance.extract.mockResolvedValue({
        fields: [],
        engine: 'easyocr',
        image_width: 800,
        image_height: 600,
        processing_time_ms: 1000,
        usage: { api_calls: 0 }
      });

      mockExecFile.mockImplementation((cmd: any, args: any, options: any, callback: any) => {
        const mockOutput = JSON.stringify({
          success: true,
          global_score: 0.5,
          heatmap_b64: Buffer.from(new Float32Array([0.1])).toString('base64'),
          width: 1,
          height: 1
        });
        callback(null, { stdout: mockOutput });
      });

      mockScoreFieldsAgainstHeatmap.mockReturnValue([]);
      mockComputeVerdict.mockReturnValue({
        verdict: 'NORMAL',
        overall_score: 0,
        risk_level: 'low'
      });

      mockGenerateForensicsSummary.mockRejectedValue(new Error('Viz failed'));

      const result = await advancedDocumentForensics('/test/image.jpg', 'VN');

      expect(result.success).toBe(true);
      expect(result.heatmap_b64).toBeNull();
    });
  });

  describe('extractDocumentFields', () => {
    it('should successfully extract fields with EasyOCR', async () => {
      mockExtractorInstance.extract.mockResolvedValue({
        fields: [
          {
            label: 'patient_name',
            text: 'Jane Smith',
            confidence: 0.92,
            bbox: { x: 20, y: 30, width: 120, height: 25 },
            page_number: 1
          }
        ],
        engine: 'easyocr',
        image_width: 1024,
        image_height: 768,
        processing_time_ms: 1200,
        usage: { api_calls: 0 }
      });

      const result = await extractDocumentFields('/test/document.jpg', 'VN');

      expect(result.success).toBe(true);
      expect(result.engine).toBe('easyocr');
      expect(result.document_type).toBe('auto');
      expect(result.fields).toHaveLength(1);
      expect(result.total_fields).toBe(1);
      expect(result.processing_time_ms).toBe(1200);
      expect(result.image.width).toBe(1024);
      expect(result.image.height).toBe(768);
    });

    it('should successfully extract fields with Gemini', async () => {
      mockGetOcrEngine.mockReturnValue('gemini');

      mockExtractorInstance.extract.mockResolvedValue({
        fields: [
          {
            label: 'diagnosis',
            text: 'A10.5',
            confidence: 0.98,
            bbox: { x: 100, y: 200, width: 80, height: 20 },
            page_number: 1
          }
        ],
        engine: 'gemini',
        image_width: 800,
        image_height: 600,
        processing_time_ms: 2000,
        usage: { api_calls: 1, cost_usd: 0.03 }
      });

      const result = await extractDocumentFields('/test/document.pdf', 'HK', 'gemini', 'medical_report');

      expect(result.success).toBe(true);
      expect(result.engine).toBe('gemini');
      expect(result.document_type).toBe('medical_report');
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0]!.label).toBe('diagnosis');
    });

    it('should handle extraction failure', async () => {
      mockExtractorInstance.extract.mockRejectedValue(new Error('Extraction failed'));

      const result = await extractDocumentFields('/test/document.jpg', 'ID');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Extraction failed');
      expect(result.fields).toHaveLength(0);
      expect(result.total_fields).toBe(0);
      expect(result.processing_time_ms).toBe(0);
    });

    it('should throw for invalid market code', async () => {
      await expect(extractDocumentFields('/test/document.jpg', 'INVALID')).rejects.toThrow('Unknown market');
    });
  });

  describe('batchDocumentForensics', () => {
    it('should process multiple documents in batches', async () => {
      mockExtractorInstance.extract.mockResolvedValue({
        fields: [{ label: 'text', text: 'Sample', confidence: 0.9, bbox: null, page_number: 1 }],
        engine: 'easyocr',
        image_width: 800,
        image_height: 600,
        processing_time_ms: 1000,
        usage: { api_calls: 0 }
      });

      mockExecFile.mockImplementation((cmd: any, args: any, options: any, callback: any) => {
        const mockOutput = JSON.stringify({
          success: true,
          global_score: 0.3,
          heatmap_b64: Buffer.from(new Float32Array([0.1])).toString('base64'),
          width: 1,
          height: 1
        });
        callback(null, { stdout: mockOutput });
      });

      mockScoreFieldsAgainstHeatmap.mockReturnValue([
        {
          type: 'text',
          risk_weight: 0.5,
          text: 'Sample',
          confidence: 0.9,
          bbox: null,
          scores: { anomaly: 0.3, heatmap_mean: 0.1, heatmap_max: 0.2 }
        }
      ]);

      mockComputeVerdict.mockReturnValue({
        verdict: 'NORMAL',
        overall_score: 0.3,
        risk_level: 'low'
      });

      mockGenerateForensicsSummary.mockResolvedValue(Buffer.from('summary'));

      const imagePaths = ['/test/img1.jpg', '/test/img2.jpg', '/test/img3.jpg'];
      const result = await batchDocumentForensics(imagePaths, 'VN', '/output', 'auto', 2);

      expect(result.success).toBe(true);
      expect(result.total_images).toBe(3);
      expect(result.results).toHaveLength(3);
      expect(result.summary.verdicts.NORMAL).toBe(3);
      expect(result.summary.verdicts.SUSPICIOUS).toBe(0);
      expect(result.summary.verdicts.TAMPERED).toBe(0);
      expect(result.summary.verdicts.ERROR).toBe(0);
      expect(result.summary.avg_score).toBe(0.3);
      expect(mockMkdirSync).toHaveBeenCalledWith('/output', { recursive: true });
    });

    it('should handle mixed success and error results', async () => {
      let callCount = 0;
      mockExtractorInstance.extract.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error('OCR failed'));
        }
        return Promise.resolve({
          fields: [],
          engine: 'easyocr',
          image_width: 800,
          image_height: 600,
          processing_time_ms: 1000,
          usage: { api_calls: 0 }
        });
      });

      mockExecFile.mockImplementation((cmd: any, args: any, options: any, callback: any) => {
        const mockOutput = JSON.stringify({
          success: true,
          global_score: 0.5,
          heatmap_b64: null,
          width: 0,
          height: 0
        });
        callback(null, { stdout: mockOutput });
      });

      mockScoreFieldsAgainstHeatmap.mockReturnValue([]);
      mockComputeVerdict.mockReturnValue({
        verdict: 'NORMAL',
        overall_score: 0.5,
        risk_level: 'low'
      });

      const imagePaths = ['/test/img1.jpg', '/test/img2.jpg', '/test/img3.jpg'];
      const result = await batchDocumentForensics(imagePaths, 'TH');

      expect(result.success).toBe(true);
      expect(result.total_images).toBe(3);
      expect(result.results).toHaveLength(3);
      expect(result.summary.verdicts.NORMAL).toBe(2);
      expect(result.summary.verdicts.ERROR).toBe(1);

      const errorResult = result.results.find((r: any) => r.verdict === 'ERROR');
      expect(errorResult).toBeDefined();
      expect(errorResult!.error).toContain('OCR extraction failed');
    });

    it('should handle processing exception gracefully', async () => {
      mockExtractorInstance.extract.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const imagePaths = ['/test/img1.jpg'];
      const result = await batchDocumentForensics(imagePaths, 'ID');

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.verdict).toBe('ERROR');
      expect(result.results[0]!.error).toContain('Unexpected error');
      expect(result.summary.verdicts.ERROR).toBe(1);
    });

    it('should calculate summary statistics correctly', async () => {
      mockExtractorInstance.extract.mockResolvedValue({
        fields: [],
        engine: 'easyocr',
        image_width: 800,
        image_height: 600,
        processing_time_ms: 1000,
        usage: { api_calls: 0 }
      });

      // Provide a valid heatmap so verdict comes from computeVerdict (not forced NORMAL)
      const heatmapB64 = Buffer.from(new Float32Array([0.1])).toString('base64');
      mockExecFile.mockImplementation((cmd: any, args: any, options: any, callback: any) => {
        const mockOutput = JSON.stringify({
          success: true,
          global_score: 0.6,
          heatmap_b64: heatmapB64,
          width: 1,
          height: 1
        });
        callback(null, { stdout: mockOutput });
      });

      mockScoreFieldsAgainstHeatmap.mockReturnValue([]);
      mockGenerateForensicsSummary.mockResolvedValue(Buffer.from('summary'));

      const scores = [0.2, 0.7, 0.9];
      let callIdx = 0;
      mockComputeVerdict.mockImplementation(() => {
        const score = scores[callIdx % scores.length]!;
        callIdx++;
        return {
          verdict: score > 0.6 ? 'SUSPICIOUS' : 'NORMAL',
          overall_score: score,
          risk_level: score > 0.6 ? 'medium' : 'low'
        };
      });

      const imagePaths = ['/test/img1.jpg', '/test/img2.jpg', '/test/img3.jpg'];
      const result = await batchDocumentForensics(imagePaths, 'VN');

      expect(result.summary.verdicts.NORMAL).toBe(1);
      expect(result.summary.verdicts.SUSPICIOUS).toBe(2);
      expect(result.summary.avg_score).toBeCloseTo(0.6);
      expect(result.summary.max_score).toBe(0.9);
      expect(result.summary.min_score).toBe(0.2);
    });

    it('should respect concurrency limits', async () => {
      mockExtractorInstance.extract.mockResolvedValue({
        fields: [],
        engine: 'easyocr',
        image_width: 800,
        image_height: 600,
        processing_time_ms: 100,
        usage: { api_calls: 0 }
      });

      mockExecFile.mockImplementation((cmd: any, args: any, options: any, callback: any) => {
        setTimeout(() => {
          const mockOutput = JSON.stringify({
            success: true,
            global_score: 0.5,
            heatmap_b64: null,
            width: 0,
            height: 0
          });
          callback(null, { stdout: mockOutput });
        }, 50);
      });

      mockScoreFieldsAgainstHeatmap.mockReturnValue([]);
      mockComputeVerdict.mockReturnValue({
        verdict: 'NORMAL',
        overall_score: 0.5,
        risk_level: 'low'
      });

      const imagePaths = ['/test/img1.jpg', '/test/img2.jpg', '/test/img3.jpg', '/test/img4.jpg', '/test/img5.jpg'];
      const startTime = Date.now();

      const result = await batchDocumentForensics(imagePaths, 'VN', undefined, 'auto', 2);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(5);

      expect(duration).toBeGreaterThan(100);
    });
  });
});
