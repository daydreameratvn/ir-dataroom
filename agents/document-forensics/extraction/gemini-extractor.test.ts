import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiExtractor } from './gemini-extractor.ts';
import type { MarketCode } from './market-config.ts';

// Mock dependencies
vi.mock('node:fs');
vi.mock('sharp');
vi.mock('@google/genai');
vi.mock('../config.ts', () => ({
  getGeminiApiKey: vi.fn(() => 'mock-api-key'),
}));
vi.mock('./types.ts', () => ({
  FIELD_TYPES: ['patient_name', 'amount', 'date', 'diagnosis', 'insurance_id', 'text'],
}));

const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockSharp = vi.fn();
const mockGoogleGenAI = vi.fn();

vi.mocked(require('node:fs')).existsSync = mockExistsSync;
vi.mocked(require('node:fs')).readFileSync = mockReadFileSync;
vi.mocked(require('sharp')).default = mockSharp;
vi.mocked(require('@google/genai')).GoogleGenAI = mockGoogleGenAI;

describe('GeminiExtractor', () => {
  let mockAiInstance: any;
  let mockFilesApi: any;
  let mockModelsApi: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock AI instance
    mockFilesApi = {
      upload: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
    };

    mockModelsApi = {
      generateContent: vi.fn(),
    };

    mockAiInstance = {
      files: mockFilesApi,
      models: mockModelsApi,
    };

    mockGoogleGenAI.mockReturnValue(mockAiInstance);

    // Default mock implementations
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(Buffer.from('mock-image-data'));
    mockSharp.mockReturnValue({
      metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 })
    });
  });

  describe('constructor', () => {
    it('should initialize with VN market and API key', () => {
      const extractor = new GeminiExtractor('VN');
      expect(extractor).toBeInstanceOf(GeminiExtractor);
      expect(mockGoogleGenAI).toHaveBeenCalledWith({ apiKey: 'mock-api-key' });
    });

    it('should initialize with custom API key', () => {
      const extractor = new GeminiExtractor('TH', 'custom-key');
      expect(extractor).toBeInstanceOf(GeminiExtractor);
      expect(mockGoogleGenAI).toHaveBeenCalledWith({ apiKey: 'custom-key' });
    });

    it('should throw error when no API key is provided', () => {
      const mockGetGeminiApiKey = vi.mocked(require('../config.ts')).getGeminiApiKey;
      mockGetGeminiApiKey.mockReturnValue(undefined);

      expect(() => new GeminiExtractor('VN')).toThrow('GEMINI_API_KEY is not set');
    });
  });

  describe('MIME type detection', () => {
    it('should detect JPEG files correctly', async () => {
      await setupSuccessfulExtraction();
      const extractor = new GeminiExtractor('VN');

      await extractor.extract('/test/image.jpg');

      expect(mockFilesApi.upload).toHaveBeenCalledWith({
        file: expect.any(Blob),
        config: { mimeType: 'image/jpeg' }
      });
    });

    it('should detect PNG files correctly', async () => {
      await setupSuccessfulExtraction();
      const extractor = new GeminiExtractor('VN');

      await extractor.extract('/test/image.png');

      expect(mockFilesApi.upload).toHaveBeenCalledWith({
        file: expect.any(Blob),
        config: { mimeType: 'image/png' }
      });
    });

    it('should detect PDF files correctly', async () => {
      await setupSuccessfulExtraction();
      const extractor = new GeminiExtractor('VN');

      await extractor.extract('/test/document.pdf');

      expect(mockFilesApi.upload).toHaveBeenCalledWith({
        file: expect.any(Blob),
        config: { mimeType: 'application/pdf' }
      });
    });
  });

  describe('extract', () => {
    it('should throw error for non-existent file', async () => {
      mockExistsSync.mockReturnValue(false);
      const extractor = new GeminiExtractor('VN');

      await expect(extractor.extract('/nonexistent/file.jpg')).rejects.toThrow('File not found');
    });

    it('should successfully extract fields from image', async () => {
      await setupSuccessfulExtraction([
        {
          box_2d: [100, 50, 150, 200], // [y_min, x_min, y_max, x_max] normalized
          label: 'patient_name',
          text: 'John Doe',
          confidence: 0.95,
          page_number: 1
        },
        {
          box_2d: [200, 100, 250, 300],
          label: 'amount',
          text: '1000 USD',
          confidence: 0.88,
          page_number: 1
        }
      ]);

      const extractor = new GeminiExtractor('VN');
      const result = await extractor.extract('/test/image.jpg');

      expect(result.success).toBe(true);
      expect(result.engine).toBe('gemini');
      expect(result.fields).toHaveLength(2);
      expect(result.image_width).toBe(800);
      expect(result.image_height).toBe(600);

      // Check field conversion
      const field1 = result.fields[0]!;
      expect(field1.label).toBe('patient_name');
      expect(field1.text).toBe('John Doe');
      expect(field1.confidence).toBe(0.95);
      expect(field1.bbox).toEqual({
        x: Math.round((50 / 1000) * 800), // x from x_min
        y: Math.round((100 / 1000) * 600), // y from y_min
        width: Math.round(((200 - 50) / 1000) * 800), // width from x_max - x_min
        height: Math.round(((150 - 100) / 1000) * 600) // height from y_max - y_min
      });
    });

    it('should handle file upload failure', async () => {
      mockFilesApi.upload.mockRejectedValue(new Error('Upload failed'));

      const extractor = new GeminiExtractor('VN');

      await expect(extractor.extract('/test/image.jpg')).rejects.toThrow('Upload failed');
    });

    it('should handle file upload without name', async () => {
      mockFilesApi.upload.mockResolvedValue({ /* no name field */ });

      const extractor = new GeminiExtractor('VN');

      await expect(extractor.extract('/test/image.jpg')).rejects.toThrow('no name returned for uploaded file');
    });

    it('should wait for file to become ACTIVE', async () => {
      mockFilesApi.upload.mockResolvedValue({ name: 'file123' });
      mockFilesApi.get
        .mockResolvedValueOnce({ state: 'PROCESSING' })
        .mockResolvedValueOnce({ state: 'ACTIVE', uri: 'gemini://file123', mimeType: 'image/jpeg' });

      await setupSuccessfulGeneration([]);

      const extractor = new GeminiExtractor('VN');

      // Mock setTimeout to advance immediately for testing
      vi.useFakeTimers();
      const extractPromise = extractor.extract('/test/image.jpg');

      // Advance timers to trigger the polling
      vi.advanceTimersByTime(2000);

      await extractPromise;
      vi.useRealTimers();

      expect(mockFilesApi.get).toHaveBeenCalledTimes(2);
    });

    it('should handle file processing failure', async () => {
      mockFilesApi.upload.mockResolvedValue({ name: 'file123' });
      mockFilesApi.get.mockResolvedValue({ state: 'FAILED' });

      const extractor = new GeminiExtractor('VN');

      await expect(extractor.extract('/test/image.jpg')).rejects.toThrow('failed processing');
    });

    it('should timeout waiting for file to become active', async () => {
      mockFilesApi.upload.mockResolvedValue({ name: 'file123' });
      mockFilesApi.get.mockResolvedValue({ state: 'PROCESSING' });

      const extractor = new GeminiExtractor('VN');

      vi.useFakeTimers();
      const extractPromise = extractor.extract('/test/image.jpg');

      // Advance past the 30 second timeout
      vi.advanceTimersByTime(30001);

      await expect(extractPromise).rejects.toThrow('timed out waiting for ACTIVE');
      vi.useRealTimers();
    });

    it('should handle Gemini API generation error', async () => {
      await setupFileUpload();
      mockModelsApi.generateContent.mockRejectedValue(new Error('API Error'));

      const extractor = new GeminiExtractor('VN');

      await expect(extractor.extract('/test/image.jpg')).rejects.toThrow('API Error');
    });

    it('should handle empty Gemini response', async () => {
      await setupFileUpload();
      mockModelsApi.generateContent.mockResolvedValue({ text: null });

      const extractor = new GeminiExtractor('VN');

      await expect(extractor.extract('/test/image.jpg')).rejects.toThrow('returned no content');
    });

    it('should handle malformed JSON response', async () => {
      await setupFileUpload();
      mockModelsApi.generateContent.mockResolvedValue({
        text: 'not valid json',
        usageMetadata: {}
      });

      const extractor = new GeminiExtractor('VN');

      await expect(extractor.extract('/test/image.jpg')).rejects.toThrow('unparseable JSON');
    });

    it('should handle truncated JSON response', async () => {
      await setupFileUpload();
      mockModelsApi.generateContent.mockResolvedValue({
        text: '[{"label": "test", "text": "incomplete',
        usageMetadata: {}
      });

      const extractor = new GeminiExtractor('VN');

      await expect(extractor.extract('/test/image.jpg')).rejects.toThrow('malformed JSON');
    });

    it('should filter out empty fields', async () => {
      await setupSuccessfulExtraction([
        {
          box_2d: [100, 50, 150, 200],
          label: 'patient_name',
          text: 'John Doe',
          confidence: 0.95
        },
        {
          box_2d: [200, 100, 250, 300],
          label: null, // Should be filtered out
          text: 'Some text',
          confidence: 0.88
        },
        {
          box_2d: [300, 150, 350, 400],
          label: 'amount',
          text: '', // Should be filtered out
          confidence: 0.80
        }
      ]);

      const extractor = new GeminiExtractor('VN');
      const result = await extractor.extract('/test/image.jpg');

      expect(result.fields).toHaveLength(1);
      expect(result.fields[0]!.label).toBe('patient_name');
      expect(result.fields[0]!.text).toBe('John Doe');
    });

    it('should cleanup uploaded file after processing', async () => {
      await setupSuccessfulExtraction([]);

      const extractor = new GeminiExtractor('VN');
      await extractor.extract('/test/image.jpg');

      expect(mockFilesApi.delete).toHaveBeenCalledWith({ name: 'file123' });
    });

    it('should cleanup file even on error', async () => {
      await setupFileUpload();
      mockModelsApi.generateContent.mockRejectedValue(new Error('API Error'));

      const extractor = new GeminiExtractor('VN');

      try {
        await extractor.extract('/test/image.jpg');
      } catch {
        // Expected to throw
      }

      expect(mockFilesApi.delete).toHaveBeenCalledWith({ name: 'file123' });
    });

    it('should handle file cleanup failure gracefully', async () => {
      await setupSuccessfulExtraction([]);
      mockFilesApi.delete.mockRejectedValue(new Error('Cleanup failed'));

      const extractor = new GeminiExtractor('VN');

      // Should not throw despite cleanup failure
      const result = await extractor.extract('/test/image.jpg');
      expect(result.success).toBe(true);
    });

    it('should calculate usage statistics and costs', async () => {
      await setupSuccessfulExtraction([], {
        promptTokenCount: 1000,
        candidatesTokenCount: 200,
        thoughtsTokenCount: 50
      });

      const extractor = new GeminiExtractor('VN');
      const result = await extractor.extract('/test/image.jpg');

      expect(result.usage).toEqual({
        api_calls: 2,
        input_tokens: 1000,
        output_tokens: 200,
        thinking_tokens: 50,
        cost_usd: expect.any(Number)
      });

      // Verify cost calculation (approximate, based on Gemini pricing)
      expect(result.usage.cost_usd).toBeGreaterThan(0);
    });

    it('should use different system prompts for different markets', async () => {
      await setupSuccessfulExtraction([]);

      const vnExtractor = new GeminiExtractor('VN');
      await vnExtractor.extract('/test/image.jpg');

      const thExtractor = new GeminiExtractor('TH');
      await thExtractor.extract('/test/image.jpg');

      // Check that different prompts were used
      const calls = mockModelsApi.generateContent.mock.calls;
      expect(calls).toHaveLength(2);

      const vnPrompt = calls[0][0].config.systemInstruction[0];
      const thPrompt = calls[1][0].config.systemInstruction[0];

      expect(vnPrompt).toContain('Vietnamese');
      expect(thPrompt).toContain('Thai');
    });

    it('should handle PDF files without image metadata', async () => {
      await setupSuccessfulExtraction([
        {
          box_2d: [100, 50, 150, 200],
          label: 'patient_name',
          text: 'John Doe',
          confidence: 0.95
        }
      ]);

      const extractor = new GeminiExtractor('VN');
      const result = await extractor.extract('/test/document.pdf');

      expect(result.success).toBe(true);
      expect(result.image_width).toBe(0); // No metadata for PDFs
      expect(result.image_height).toBe(0);
      expect(result.fields[0]!.bbox).toBeNull(); // No bbox conversion for PDFs
    });
  });

  // Helper functions for test setup
  async function setupFileUpload() {
    mockFilesApi.upload.mockResolvedValue({ name: 'file123' });
    mockFilesApi.get.mockResolvedValue({
      state: 'ACTIVE',
      uri: 'gemini://file123',
      mimeType: 'image/jpeg'
    });
  }

  async function setupSuccessfulGeneration(fields: any[], usageMetadata?: any) {
    mockModelsApi.generateContent.mockResolvedValue({
      text: JSON.stringify(fields),
      usageMetadata: usageMetadata || {}
    });
  }

  async function setupSuccessfulExtraction(fields: any[] = [], usageMetadata?: any) {
    await setupFileUpload();
    await setupSuccessfulGeneration(fields, usageMetadata);
  }
});