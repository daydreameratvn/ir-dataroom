import { describe, it, expect } from 'vitest';
import {
  getFileTypeInfo,
  getCategoryStyle,
  formatFileSize,
  formatRelativeDate,
  getStatusStyle,
} from './file-utils';

// ── getFileTypeInfo ──

describe('getFileTypeInfo', () => {
  it('returns PDF info for application/pdf', () => {
    const info = getFileTypeInfo('application/pdf');
    expect(info.label).toBe('PDF');
    expect(info.bgClass).toContain('red');
  });

  it('returns Excel info for spreadsheet mime types', () => {
    const xlsx = getFileTypeInfo('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(xlsx.label).toBe('Excel');
    expect(xlsx.bgClass).toContain('emerald');

    const csv = getFileTypeInfo('text/csv');
    expect(csv.label).toBe('Excel');
  });

  it('returns PPT info for presentation mime types', () => {
    const ppt = getFileTypeInfo('application/vnd.openxmlformats-officedocument.presentationml.presentation');
    expect(ppt.label).toBe('PPT');
    expect(ppt.bgClass).toContain('orange');
  });

  it('returns Video info for video/* types', () => {
    expect(getFileTypeInfo('video/mp4').label).toBe('Video');
    expect(getFileTypeInfo('video/webm').label).toBe('Video');
  });

  it('returns Image info for image/* types', () => {
    expect(getFileTypeInfo('image/png').label).toBe('Image');
    expect(getFileTypeInfo('image/jpeg').bgClass).toContain('sky');
  });

  it('returns Word info for word/document types', () => {
    const word = getFileTypeInfo('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(word.label).toBe('Word');
    expect(word.bgClass).toContain('blue');
  });

  it('returns default File for unknown types', () => {
    expect(getFileTypeInfo('application/octet-stream').label).toBe('File');
    expect(getFileTypeInfo('text/plain').label).toBe('File');
  });

  it('handles null mimeType', () => {
    expect(getFileTypeInfo(null).label).toBe('File');
  });
});

// ── getCategoryStyle ──

describe('getCategoryStyle', () => {
  it('returns emerald for financials', () => {
    const style = getCategoryStyle('financials');
    expect(style.bgClass).toContain('emerald');
  });

  it('returns blue for strategy', () => {
    const style = getCategoryStyle('strategy');
    expect(style.bgClass).toContain('blue');
  });

  it('returns violet for product', () => {
    expect(getCategoryStyle('product').bgClass).toContain('violet');
  });

  it('returns amber for legal', () => {
    expect(getCategoryStyle('legal').bgClass).toContain('amber');
  });

  it('returns default gray for unknown category', () => {
    const style = getCategoryStyle('unknown');
    expect(style.bgClass).toContain('gray');
  });

  it('is case-insensitive', () => {
    expect(getCategoryStyle('FINANCIALS').bgClass).toContain('emerald');
    expect(getCategoryStyle('Strategy').bgClass).toContain('blue');
  });
});

// ── formatFileSize ──

describe('formatFileSize', () => {
  it('returns "0 B" for zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('formats bytes correctly', () => {
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('formats KB correctly', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats MB correctly', () => {
    expect(formatFileSize(1048576)).toBe('1.0 MB');
  });

  it('formats GB correctly', () => {
    expect(formatFileSize(1073741824)).toBe('1.0 GB');
  });
});

// ── formatRelativeDate ──

describe('formatRelativeDate', () => {
  it('returns "Today" for current date', () => {
    expect(formatRelativeDate(new Date().toISOString())).toBe('Today');
  });

  it('returns "Yesterday" for 1 day ago', () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    expect(formatRelativeDate(yesterday)).toBe('Yesterday');
  });

  it('returns "Xd ago" for 2-6 days', () => {
    const threeDays = new Date(Date.now() - 3 * 86_400_000).toISOString();
    expect(formatRelativeDate(threeDays)).toBe('3d ago');
  });

  it('returns "Xw ago" for 7-29 days', () => {
    const tenDays = new Date(Date.now() - 10 * 86_400_000).toISOString();
    expect(formatRelativeDate(tenDays)).toBe('1w ago');

    const twentyDays = new Date(Date.now() - 20 * 86_400_000).toISOString();
    expect(formatRelativeDate(twentyDays)).toBe('2w ago');
  });

  it('returns formatted date for 30+ days', () => {
    const old = new Date(Date.now() - 45 * 86_400_000).toISOString();
    const result = formatRelativeDate(old);
    // Should be a month+day format like "Jan 18"
    expect(result).toMatch(/\w{3}\s+\d{1,2}/);
  });
});

// ── getStatusStyle ──

describe('getStatusStyle', () => {
  it('returns emerald for active', () => {
    expect(getStatusStyle('active').bgClass).toContain('emerald');
  });

  it('returns emerald for open', () => {
    expect(getStatusStyle('open').bgClass).toContain('emerald');
  });

  it('returns amber for draft', () => {
    expect(getStatusStyle('draft').bgClass).toContain('amber');
  });

  it('returns gray for closed', () => {
    expect(getStatusStyle('closed').bgClass).toContain('gray');
  });

  it('returns gray for archived', () => {
    expect(getStatusStyle('archived').bgClass).toContain('gray');
  });

  it('returns gray for unknown status', () => {
    expect(getStatusStyle('unknown').bgClass).toContain('gray');
  });

  it('is case-insensitive', () => {
    expect(getStatusStyle('ACTIVE').bgClass).toContain('emerald');
    expect(getStatusStyle('Draft').bgClass).toContain('amber');
  });
});
