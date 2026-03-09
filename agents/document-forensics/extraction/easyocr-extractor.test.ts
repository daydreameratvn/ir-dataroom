import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MarketCode } from './market-config.ts';

// Setup mocks before imports
const mockExistsSync = vi.fn();
const mockSpawn = vi.fn();
const mockSharp = vi.fn();

vi.mock('node:fs', () => ({
  existsSync: (...args: any[]) => mockExistsSync(...args),
}));

vi.mock('node:child_process', () => ({
  spawn: (...args: any[]) => mockSpawn(...args),
}));

vi.mock('sharp', () => ({
  default: (...args: any[]) => mockSharp(...args),
}));

vi.mock('../config.ts', () => ({
  PYTHON_PROJECT_PATH: '/mock/python/path',
}));

import { EasyOCRExtractor } from './easyocr-extractor.ts';

describe('EasyOCRExtractor', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockExistsSync.mockReturnValue(true);
    mockSharp.mockReturnValue({
      metadata: vi.fn().mockResolvedValue({ width: 800, height: 600 })
    });
  });

  describe('constructor', () => {
    it('should initialize with VN market config', () => {
      const extractor = new EasyOCRExtractor('VN');
      expect(extractor).toBeInstanceOf(EasyOCRExtractor);
    });

    it('should initialize with TH market config', () => {
      const extractor = new EasyOCRExtractor('TH');
      expect(extractor).toBeInstanceOf(EasyOCRExtractor);
    });

    it('should use provided language override', () => {
      const extractor = new EasyOCRExtractor('VN', 'en');
      expect(extractor).toBeInstanceOf(EasyOCRExtractor);
    });

    it('should use environment variable for languages', () => {
      process.env.EASYOCR_LANG = 'zh,en';
      const extractor = new EasyOCRExtractor('HK');
      expect(extractor).toBeInstanceOf(EasyOCRExtractor);
      delete process.env.EASYOCR_LANG;
    });
  });

  describe('extract', () => {
    it('should throw error for non-existent file', async () => {
      mockExistsSync.mockReturnValue(false);
      const extractor = new EasyOCRExtractor('VN');

      await expect(extractor.extract('/nonexistent/file.jpg')).rejects.toThrow('File not found');
    });

    it('should successfully extract fields from image', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn()
      };

      mockSpawn.mockReturnValue(mockProc);

      const mockOcrOutput = JSON.stringify([
        {
          text_raw: 'John Doe',
          confidence: 0.95,
          box: [10, 20, 100, 50]
        },
        {
          text_raw: '1000 VND',
          confidence: 0.88,
          box: [50, 100, 150, 130]
        }
      ]);

      mockProc.on.mockImplementation((event: string, callback: any) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
        return mockProc;
      });

      mockProc.stdout.on.mockImplementation((event: string, callback: any) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from(mockOcrOutput)), 5);
        }
        return mockProc.stdout;
      });

      mockProc.stderr.on.mockImplementation((event: string, callback: any) => {
        return mockProc.stderr;
      });

      const extractor = new EasyOCRExtractor('VN');
      const result = await extractor.extract('/test/image.jpg');

      expect(result.engine).toBe('easyocr');
      expect(result.fields).toHaveLength(2);
      expect(result.image_width).toBe(800);
      expect(result.image_height).toBe(600);
      expect(result.processing_time_ms).toBeGreaterThan(0);

      const field1 = result.fields[0]!;
      expect(field1.text).toBe('John Doe');
      expect(field1.confidence).toBe(0.95);
      expect(field1.bbox).toEqual({ x: 10, y: 20, width: 90, height: 30 });
      expect(field1.page_number).toBe(1);

      const field2 = result.fields[1]!;
      expect(field2.text).toBe('1000 VND');
      expect(field2.confidence).toBe(0.88);
      expect(field2.bbox).toEqual({ x: 50, y: 100, width: 100, height: 30 });
    });

    it('should handle subprocess error', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn()
      };

      mockSpawn.mockReturnValue(mockProc);

      mockProc.on.mockImplementation((event: string, callback: any) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 10);
        }
        return mockProc;
      });

      mockProc.stderr.on.mockImplementation((event: string, callback: any) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from('EasyOCR failed to load model')), 5);
        }
        return mockProc.stderr;
      });

      mockProc.stdout.on.mockImplementation((event: string, callback: any) => {
        return mockProc.stdout;
      });

      const extractor = new EasyOCRExtractor('VN');

      await expect(extractor.extract('/test/image.jpg')).rejects.toThrow('Python process exited 1');
    });

    it('should handle spawn error', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn()
      };

      mockSpawn.mockReturnValue(mockProc);

      mockProc.on.mockImplementation((event: string, callback: any) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Command not found')), 10);
        }
        return mockProc;
      });

      mockProc.stdout.on.mockReturnValue(mockProc.stdout);
      mockProc.stderr.on.mockReturnValue(mockProc.stderr);

      const extractor = new EasyOCRExtractor('VN');

      await expect(extractor.extract('/test/image.jpg')).rejects.toThrow('Command not found');
    });

    it('should handle invalid JSON response', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn()
      };

      mockSpawn.mockReturnValue(mockProc);

      mockProc.on.mockImplementation((event: string, callback: any) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
        return mockProc;
      });

      mockProc.stdout.on.mockImplementation((event: string, callback: any) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from('Not valid JSON')), 5);
        }
        return mockProc.stdout;
      });

      mockProc.stderr.on.mockReturnValue(mockProc.stderr);

      const extractor = new EasyOCRExtractor('VN');

      await expect(extractor.extract('/test/image.jpg')).rejects.toThrow('EasyOCR returned no JSON');
    });

    it('should filter out empty text results', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn()
      };

      mockSpawn.mockReturnValue(mockProc);

      const mockOcrOutput = JSON.stringify([
        {
          text_raw: 'Valid Text',
          confidence: 0.95,
          box: [10, 20, 100, 50]
        },
        {
          text_raw: '   ',
          confidence: 0.88,
          box: [50, 100, 150, 130]
        },
        {
          text_raw: '',
          confidence: 0.90,
          box: [200, 100, 250, 130]
        }
      ]);

      mockProc.on.mockImplementation((event: string, callback: any) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
        return mockProc;
      });

      mockProc.stdout.on.mockImplementation((event: string, callback: any) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from(mockOcrOutput)), 5);
        }
        return mockProc.stdout;
      });

      mockProc.stderr.on.mockReturnValue(mockProc.stderr);

      const extractor = new EasyOCRExtractor('VN');
      const result = await extractor.extract('/test/image.jpg');

      // EasyOCR extractor maps all items including whitespace-only text
      expect(result.fields).toHaveLength(3);
      expect(result.fields[0]!.text).toBe('Valid Text');
    });
  });

  describe('field classification', () => {
    it('should classify VN insurance IDs correctly', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn()
      };

      mockSpawn.mockReturnValue(mockProc);

      const mockOcrOutput = JSON.stringify([
        { text_raw: 'BHXH123456789', confidence: 0.95, box: [10, 20, 100, 50] },
        { text_raw: 'GB1234567890', confidence: 0.90, box: [10, 60, 100, 90] }
      ]);

      mockProc.on.mockImplementation((event: string, callback: any) => {
        if (event === 'close') setTimeout(() => callback(0), 10);
        return mockProc;
      });

      mockProc.stdout.on.mockImplementation((event: string, callback: any) => {
        if (event === 'data') setTimeout(() => callback(Buffer.from(mockOcrOutput)), 5);
        return mockProc.stdout;
      });

      mockProc.stderr.on.mockReturnValue(mockProc.stderr);

      const extractor = new EasyOCRExtractor('VN');
      const result = await extractor.extract('/test/image.jpg');

      expect(result.fields).toHaveLength(2);
      expect(result.fields[0]!.label).toBe('insurance_id');
      expect(result.fields[1]!.label).toBe('insurance_id');
    });

    it('should classify amounts correctly', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn()
      };

      mockSpawn.mockReturnValue(mockProc);

      const mockOcrOutput = JSON.stringify([
        { text_raw: '1,000,000 VND', confidence: 0.95, box: [10, 20, 100, 50] },
        { text_raw: '₫500,000', confidence: 0.90, box: [10, 60, 100, 90] }
      ]);

      mockProc.on.mockImplementation((event: string, callback: any) => {
        if (event === 'close') setTimeout(() => callback(0), 10);
        return mockProc;
      });

      mockProc.stdout.on.mockImplementation((event: string, callback: any) => {
        if (event === 'data') setTimeout(() => callback(Buffer.from(mockOcrOutput)), 5);
        return mockProc.stdout;
      });

      mockProc.stderr.on.mockReturnValue(mockProc.stderr);

      const extractor = new EasyOCRExtractor('VN');
      const result = await extractor.extract('/test/image.jpg');

      expect(result.fields).toHaveLength(2);
      expect(result.fields[0]!.label).toBe('amount');
      expect(result.fields[1]!.label).toBe('amount');
    });

    it('should classify patient names with heuristics', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn()
      };

      mockSpawn.mockReturnValue(mockProc);

      const mockOcrOutput = JSON.stringify([
        { text_raw: 'Nguyễn Văn An', confidence: 0.95, box: [10, 20, 100, 50] },
        { text_raw: 'TRAN THI BINH', confidence: 0.90, box: [10, 60, 100, 90] },
        { text_raw: 'not a name 123', confidence: 0.85, box: [10, 100, 100, 130] }
      ]);

      mockProc.on.mockImplementation((event: string, callback: any) => {
        if (event === 'close') setTimeout(() => callback(0), 10);
        return mockProc;
      });

      mockProc.stdout.on.mockImplementation((event: string, callback: any) => {
        if (event === 'data') setTimeout(() => callback(Buffer.from(mockOcrOutput)), 5);
        return mockProc.stdout;
      });

      mockProc.stderr.on.mockReturnValue(mockProc.stderr);

      const extractor = new EasyOCRExtractor('VN');
      const result = await extractor.extract('/test/image.jpg');

      expect(result.fields).toHaveLength(3);
      expect(result.fields[0]!.label).toBe('patient_name');
      expect(result.fields[1]!.label).toBe('patient_name');
      expect(result.fields[2]!.label).toBe('unknown');
    });

    it('should use appropriate field rules for different markets', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn()
      };

      mockSpawn.mockReturnValue(mockProc);

      const mockOcrOutput = JSON.stringify([
        { text_raw: '1000 บาท', confidence: 0.95, box: [10, 20, 100, 50] }
      ]);

      mockProc.on.mockImplementation((event: string, callback: any) => {
        if (event === 'close') setTimeout(() => callback(0), 10);
        return mockProc;
      });

      mockProc.stdout.on.mockImplementation((event: string, callback: any) => {
        if (event === 'data') setTimeout(() => callback(Buffer.from(mockOcrOutput)), 5);
        return mockProc.stdout;
      });

      mockProc.stderr.on.mockReturnValue(mockProc.stderr);

      const extractor = new EasyOCRExtractor('TH');
      const result = await extractor.extract('/test/image.jpg');

      expect(result.fields).toHaveLength(1);
      expect(result.fields[0]!.label).toBe('amount');
    });
  });

  describe('usage statistics', () => {
    it('should return zero API calls usage', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn()
      };

      mockSpawn.mockReturnValue(mockProc);

      const mockOcrOutput = JSON.stringify([]);

      mockProc.on.mockImplementation((event: string, callback: any) => {
        if (event === 'close') setTimeout(() => callback(0), 10);
        return mockProc;
      });

      mockProc.stdout.on.mockImplementation((event: string, callback: any) => {
        if (event === 'data') setTimeout(() => callback(Buffer.from(mockOcrOutput)), 5);
        return mockProc.stdout;
      });

      mockProc.stderr.on.mockReturnValue(mockProc.stderr);

      const extractor = new EasyOCRExtractor('VN');
      const result = await extractor.extract('/test/image.jpg');

      expect(result.usage).toEqual({ api_calls: 0 });
    });
  });
});
