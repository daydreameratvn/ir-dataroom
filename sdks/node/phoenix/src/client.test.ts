import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PhoenixClient } from './client';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PhoenixClient', () => {
  let client: PhoenixClient;

  beforeEach(() => {
    client = new PhoenixClient({ baseUrl: 'https://phoenix.papaya.asia' });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Constructor
  // ═══════════════════════════════════════════════════════════════════════════

  describe('constructor', () => {
    it('strips trailing slash from baseUrl', () => {
      const c = new PhoenixClient({ baseUrl: 'https://example.com/' });
      mockFetch.mockResolvedValueOnce(jsonResponse({ results: [] }));
      c.login(['X']);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/auth/phoenix/login',
        expect.any(Object),
      );
    });

    it('uses default timeout of 30 seconds', () => {
      const c = new PhoenixClient({ baseUrl: 'https://example.com' });
      // Access private property via type assertion to test default
      expect((c as any).timeout).toBe(30_000);
    });

    it('uses custom timeout when provided', () => {
      const c = new PhoenixClient({ baseUrl: 'https://example.com', timeout: 60_000 });
      expect((c as any).timeout).toBe(60_000);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Headers
  // ═══════════════════════════════════════════════════════════════════════════

  describe('headers', () => {
    it('sends Content-Type header', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ results: [] }));
      await client.login(['X']);

      const [, init] = mockFetch.mock.calls[0]!;
      expect(init.headers['Content-Type']).toBe('application/json');
    });

    it('sends Authorization header when token is set', async () => {
      client.setToken('my-jwt');
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));
      await client.listClaims();

      const [, init] = mockFetch.mock.calls[0]!;
      expect(init.headers['Authorization']).toBe('Bearer my-jwt');
    });

    it('does not send Authorization header without token', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ results: [] }));
      await client.login(['X']);

      const [, init] = mockFetch.mock.calls[0]!;
      expect(init.headers['Authorization']).toBeUndefined();
    });

    it('sends x-tenant-id header when set', async () => {
      client.setTenantId('tenant-123');
      mockFetch.mockResolvedValueOnce(jsonResponse({ results: [] }));
      await client.login(['X']);

      const [, init] = mockFetch.mock.calls[0]!;
      expect(init.headers['x-tenant-id']).toBe('tenant-123');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // login
  // ═══════════════════════════════════════════════════════════════════════════

  describe('login', () => {
    it('posts to /auth/phoenix/login with policy numbers', async () => {
      const mockResults = [
        { policyNumber: 'P-001', success: true, token: 'jwt-1', policy: { id: '1', policyNumber: 'P-001', insuredName: 'Test', status: 'active' } },
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse(mockResults));

      const results = await client.login(['P-001']);

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://phoenix.papaya.asia/auth/phoenix/login');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ policyNumbers: ['P-001'] });
      expect(results).toEqual(mockResults);
    });

    it('handles multi-policy login', async () => {
      const mockResults = [
        { policyNumber: 'P-001', success: true, token: 'jwt-1', policy: { id: '1', policyNumber: 'P-001', insuredName: 'A', status: 'active' } },
        { policyNumber: 'P-002', success: false, message: 'POLICY_NOT_FOUND' },
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse(mockResults));

      const results = await client.login(['P-001', 'P-002']);
      expect(results).toHaveLength(2);
      expect(results[0]!.success).toBe(true);
      expect(results[1]!.success).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // refreshToken
  // ═══════════════════════════════════════════════════════════════════════════

  describe('refreshToken', () => {
    it('posts to /auth/phoenix/token/refresh', async () => {
      client.setToken('old-token');
      mockFetch.mockResolvedValueOnce(jsonResponse({ token: 'new-token' }));

      const result = await client.refreshToken();

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://phoenix.papaya.asia/auth/phoenix/token/refresh');
      expect(init.method).toBe('POST');
      expect(result.token).toBe('new-token');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // listClaims
  // ═══════════════════════════════════════════════════════════════════════════

  describe('listClaims', () => {
    it('gets /auth/phoenix/claims and unwraps data', async () => {
      const claims = [
        { id: 'c1', claimNumber: 'CLM-001', status: 'submitted', claimantName: 'Test', providerName: null, amountClaimed: 1000, amountApproved: null, amountPaid: null, currency: 'VND', dateOfLoss: null, dateOfService: null, createdAt: '2026-01-01' },
      ];
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: claims }));

      const result = await client.listClaims();

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://phoenix.papaya.asia/auth/phoenix/claims');
      expect(result).toEqual(claims);
    });

    it('returns empty array when no claims', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));

      const result = await client.listClaims();
      expect(result).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getClaim
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getClaim', () => {
    it('gets /auth/phoenix/claims/:id', async () => {
      const detail = { id: 'c1', claimNumber: 'CLM-001', status: 'submitted', documents: [], notes: [], aiSummary: null, aiRecommendation: null };
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(jsonResponse(detail));

      const result = await client.getClaim('c1');

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://phoenix.papaya.asia/auth/phoenix/claims/c1');
      expect(result).toEqual(detail);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // submitClaim
  // ═══════════════════════════════════════════════════════════════════════════

  describe('submitClaim', () => {
    it('posts to /auth/phoenix/claims', async () => {
      const newClaim = { id: 'c2', claimNumber: 'CLM-002', status: 'submitted' };
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(jsonResponse(newClaim));

      const input = { claimantName: 'Test', amountClaimed: 5000, currency: 'VND' };
      const result = await client.submitClaim(input);

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://phoenix.papaya.asia/auth/phoenix/claims');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual(input);
      expect(result).toEqual(newClaim);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // uploadDocument
  // ═══════════════════════════════════════════════════════════════════════════

  describe('uploadDocument', () => {
    it('posts to /auth/phoenix/claims/:id/documents', async () => {
      const mockResult = { uploadUrl: 'https://s3.example.com/upload', document: { id: 'doc1', fileName: 'receipt.pdf' } };
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(jsonResponse(mockResult));

      const result = await client.uploadDocument('c1', { fileName: 'receipt.pdf', fileType: 'application/pdf' });

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://phoenix.papaya.asia/auth/phoenix/claims/c1/documents');
      expect(init.method).toBe('POST');
      expect(result.uploadUrl).toBe('https://s3.example.com/upload');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getClaimDocuments
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getClaimDocuments', () => {
    it('gets /auth/phoenix/claims/:id/documents and unwraps data', async () => {
      const documents = [
        { id: 'doc1', fileName: 'receipt.pdf', fileType: 'application/pdf', uploadedAt: '2026-01-01', downloadUrl: 'https://s3.example.com/doc1' },
        { id: 'doc2', fileName: 'photo.jpg', fileType: 'image/jpeg', uploadedAt: '2026-01-02', downloadUrl: 'https://s3.example.com/doc2' },
      ];
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: documents }));

      const result = await client.getClaimDocuments('c1');

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://phoenix.papaya.asia/auth/phoenix/claims/c1/documents');
      expect(result).toEqual(documents);
    });

    it('returns empty array when no documents', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));

      const result = await client.getClaimDocuments('c1');
      expect(result).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // deleteDocument
  // ═══════════════════════════════════════════════════════════════════════════

  describe('deleteDocument', () => {
    it('deletes /auth/phoenix/claims/:id/documents/:docId', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

      const result = await client.deleteDocument('c1', 'doc1');

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://phoenix.papaya.asia/auth/phoenix/claims/c1/documents/doc1');
      expect(init.method).toBe('DELETE');
      expect(result.success).toBe(true);
    });

    it('handles delete failure response', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: false }));

      const result = await client.deleteDocument('c1', 'doc1');
      expect(result.success).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // requestOtp / verifyOtp
  // ═══════════════════════════════════════════════════════════════════════════

  describe('requestOtp', () => {
    it('posts to /auth/phoenix/claims/:id/otp/request', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

      const result = await client.requestOtp('c1');

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://phoenix.papaya.asia/auth/phoenix/claims/c1/otp/request');
      expect(init.method).toBe('POST');
      expect(result.success).toBe(true);
    });
  });

  describe('verifyOtp', () => {
    it('posts to /auth/phoenix/claims/:id/otp/verify with code', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, verified: true }));

      const result = await client.verifyOtp('c1', '123456');

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://phoenix.papaya.asia/auth/phoenix/claims/c1/otp/verify');
      expect(JSON.parse(init.body)).toEqual({ code: '123456' });
      expect(result.verified).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Error handling
  // ═══════════════════════════════════════════════════════════════════════════

  describe('error handling', () => {
    it('throws on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(401, 'Unauthorized'));

      await expect(client.login(['X'])).rejects.toThrow('Phoenix API error: 401');
    });

    it('throws on 500 response', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(errorResponse(500, 'Internal Server Error'));

      await expect(client.listClaims()).rejects.toThrow('Phoenix API error: 500');
    });

    it('throws on network error', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(client.login(['X'])).rejects.toThrow('Failed to fetch');
    });

    it('aborts request when timeout is reached', async () => {
      const clientWithShortTimeout = new PhoenixClient({
        baseUrl: 'https://phoenix.papaya.asia',
        timeout: 100
      });

      // Mock fetch to simulate abort behavior
      mockFetch.mockImplementationOnce((url, options) => {
        return new Promise((resolve, reject) => {
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
          // Don't resolve to simulate hanging request
        });
      });

      await expect(clientWithShortTimeout.login(['X'])).rejects.toThrow('The operation was aborted.');
    });

    it('clears timeout after successful request', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      mockFetch.mockResolvedValueOnce(jsonResponse({ results: [] }));

      await client.login(['X']);

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('clears timeout after failed request', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      mockFetch.mockResolvedValueOnce(errorResponse(500));

      await expect(client.login(['X'])).rejects.toThrow('Phoenix API error: 500');

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });
});
