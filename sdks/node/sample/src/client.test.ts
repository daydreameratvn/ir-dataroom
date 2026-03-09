import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PapayaClient } from './client';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, statusText = 'Error') {
  return new Response(JSON.stringify({ error: statusText }), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('PapayaClient', () => {
  let client: PapayaClient;

  beforeEach(() => {
    client = new PapayaClient({ apiKey: 'test-key' });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('uses default baseUrl', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: '1' }));
      await client.getClaim('1');
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://api.papaya.ai/v1/claims/1');
    });

    it('uses custom baseUrl', async () => {
      const custom = new PapayaClient({ apiKey: 'k', baseUrl: 'https://custom.api/v2' });
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: '1' }));
      await custom.getClaim('1');
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://custom.api/v2/claims/1');
    });
  });

  describe('headers', () => {
    it('sends Authorization Bearer header', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));
      await client.getClaim('1');
      const [, init] = mockFetch.mock.calls[0]!;
      expect(init.headers.Authorization).toBe('Bearer test-key');
    });

    it('sends Content-Type json header', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));
      await client.getClaim('1');
      const [, init] = mockFetch.mock.calls[0]!;
      expect(init.headers['Content-Type']).toBe('application/json');
    });
  });

  describe('getClaim', () => {
    it('fetches a claim by ID', async () => {
      const claim = { id: 'c1', claimId: 'CLM-001', status: 'open', amount: 100, currency: 'USD', submittedAt: '2026-01-01' };
      mockFetch.mockResolvedValueOnce(jsonResponse(claim));
      const result = await client.getClaim('c1');
      expect(result).toEqual(claim);
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain('/claims/c1');
    });
  });

  describe('listClaims', () => {
    it('uses default pagination', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], total: 0 }));
      await client.listClaims();
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain('page=1');
      expect(url).toContain('pageSize=20');
    });

    it('uses custom pagination', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], total: 0 }));
      await client.listClaims(3, 50);
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain('page=3');
      expect(url).toContain('pageSize=50');
    });
  });

  describe('getFWAAlert', () => {
    it('fetches an alert by ID', async () => {
      const alert = { id: 'a1', alertId: 'FWA-001', severity: 'high', score: 0.9, description: 'Suspicious', detectedAt: '2026-01-01' };
      mockFetch.mockResolvedValueOnce(jsonResponse(alert));
      const result = await client.getFWAAlert('a1');
      expect(result).toEqual(alert);
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain('/fwa/alerts/a1');
    });
  });

  describe('listFWAAlerts', () => {
    it('uses default pagination', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], total: 0 }));
      await client.listFWAAlerts();
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain('/fwa/alerts?page=1&pageSize=20');
    });

    it('uses custom pagination', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], total: 0 }));
      await client.listFWAAlerts(2, 10);
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain('page=2');
      expect(url).toContain('pageSize=10');
    });
  });

  describe('error handling', () => {
    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500, 'Internal Server Error'));
      await expect(client.getClaim('1')).rejects.toThrow('Papaya API error: 500 Internal Server Error');
    });

    it('throws on 404', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(404, 'Not Found'));
      await expect(client.getClaim('missing')).rejects.toThrow('Papaya API error: 404 Not Found');
    });

    it('throws on network error', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await expect(client.getClaim('1')).rejects.toThrow('Failed to fetch');
    });
  });
});
