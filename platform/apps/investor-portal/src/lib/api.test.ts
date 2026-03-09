import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need dynamic imports to reset module-level state (isRedirectingToLogin)
// between tests via vi.resetModules().

const TOKEN_KEY = 'investor_token';
const INFO_KEY = 'investor_info';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const defaultHeaders: Record<string, string> = {
    'content-type': 'application/json',
    ...headers,
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: defaultHeaders,
  });
}

function htmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html' },
  });
}

describe('api client', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let locationHrefSetter: ReturnType<typeof vi.fn>;
  let getItemSpy: ReturnType<typeof vi.fn>;
  let removeItemSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    // Mock localStorage methods directly on the object
    getItemSpy = vi.fn().mockReturnValue(null);
    removeItemSpy = vi.fn();
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: getItemSpy,
        setItem: vi.fn(),
        removeItem: removeItemSpy,
        clear: vi.fn(),
        length: 0,
        key: vi.fn(),
      },
      writable: true,
      configurable: true,
    });

    // Mock window.location with a writable href
    locationHrefSetter = vi.fn();
    const locationObj = {
      _href: 'http://localhost/',
    };
    Object.defineProperty(locationObj, 'href', {
      get: () => locationObj._href,
      set: (v: string) => {
        locationObj._href = v;
        locationHrefSetter(v);
      },
      configurable: true,
    });
    Object.defineProperty(window, 'location', {
      value: locationObj,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  async function loadApi() {
    return await import('./api');
  }

  function mockToken(token: string) {
    getItemSpy.mockImplementation((key: string) => {
      if (key === TOKEN_KEY) return token;
      return null;
    });
  }

  // ── 1. requestOtp sends POST with email ──

  describe('requestOtp', () => {
    it('sends POST to /auth/ir/portal/otp/request with email', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

      const api = await loadApi();
      const result = await api.requestOtp('investor@example.com');

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe('/auth/ir/portal/otp/request');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body as string)).toEqual({ email: 'investor@example.com' });
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(result).toEqual({ success: true });
    });
  });

  // ── 2. apiFetch adds Authorization header when token exists ──

  describe('Authorization header', () => {
    it('adds Bearer token when token exists in localStorage', async () => {
      mockToken('my-jwt-token');
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));

      const api = await loadApi();
      await api.listRounds();

      const [, options] = mockFetch.mock.calls[0]!;
      expect(options.headers['Authorization']).toBe('Bearer my-jwt-token');
    });

    it('does not add Authorization header when no token', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));

      const api = await loadApi();
      await api.listRounds();

      const [, options] = mockFetch.mock.calls[0]!;
      expect(options.headers['Authorization']).toBeUndefined();
    });
  });

  // ── 3. apiFetch handles 401 — clears localStorage and redirects ──

  describe('401 handling', () => {
    it('clears localStorage and redirects to /login on 401', async () => {
      mockToken('expired-token');
      mockFetch.mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401, headers: { 'content-type': 'text/plain' } }),
      );

      const api = await loadApi();
      await expect(api.listRounds()).rejects.toThrow('Unauthorized');

      expect(removeItemSpy).toHaveBeenCalledWith(TOKEN_KEY);
      expect(removeItemSpy).toHaveBeenCalledWith(INFO_KEY);
      expect(locationHrefSetter).toHaveBeenCalledWith('/login');
    });

    it('only redirects once when multiple parallel requests get 401', async () => {
      mockToken('expired-token');
      // Each call needs its own Response object (body can only be consumed once)
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response('Unauthorized', { status: 401, headers: { 'content-type': 'text/plain' } }),
        ),
      );

      const api = await loadApi();
      const results = await Promise.allSettled([
        api.listRounds(),
        api.refreshToken(),
      ]);

      expect(results[0]!.status).toBe('rejected');
      expect(results[1]!.status).toBe('rejected');
      // Should redirect only once despite two 401 responses
      expect(locationHrefSetter).toHaveBeenCalledTimes(1);
    });
  });

  // ── 4. resilientFetch retries once on 503 ──

  describe('503 retry', () => {
    it('retries once on 503 then succeeds', async () => {
      mockFetch
        .mockResolvedValueOnce(new Response('Service Unavailable', { status: 503 }))
        .mockResolvedValueOnce(jsonResponse({ data: [] }));

      const api = await loadApi();
      const promise = api.listRounds();

      // Advance past the 1s retry delay
      await vi.advanceTimersByTimeAsync(1000);

      const result = await promise;
      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('returns 503 response on second attempt if still failing', async () => {
      mockFetch
        .mockResolvedValueOnce(new Response('Service Unavailable', { status: 503 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: 'Still down' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          }),
        );

      const api = await loadApi();
      const promise = api.listRounds().catch((e: Error) => e);

      await vi.advanceTimersByTimeAsync(1000);

      const error = await promise;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Still down');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // ── 5. apiFetch throws on non-JSON 200 response (CloudFront HTML detection) ──

  describe('CloudFront HTML detection', () => {
    it('retries once then throws on HTML response', async () => {
      // Both attempts return HTML
      mockFetch
        .mockResolvedValueOnce(htmlResponse('<html>Error</html>'))
        .mockResolvedValueOnce(htmlResponse('<html>Error</html>'));

      const api = await loadApi();
      const promise = api.listRounds().catch((e: Error) => e);

      await vi.advanceTimersByTimeAsync(1000);

      const error = await promise;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('Service unavailable');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('succeeds on retry when HTML response clears', async () => {
      mockFetch
        .mockResolvedValueOnce(htmlResponse('<html>Error</html>'))
        .mockResolvedValueOnce(jsonResponse({ data: [{ id: '1' }] }));

      const api = await loadApi();
      const promise = api.listRounds();

      await vi.advanceTimersByTimeAsync(1000);

      const result = await promise;
      expect(result).toEqual([{ id: '1' }]);
    });
  });

  // ── 6. apiFetch handles 204 No Content ──

  describe('204 No Content', () => {
    it('returns undefined for 204 responses', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(null, {
          status: 204,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const api = await loadApi();
      const result = await api.acceptNda('round-1');

      expect(result).toBeUndefined();
    });
  });

  // ── 7. apiFetch throws server error message from response body ──

  describe('server error messages', () => {
    it('throws the error message from server response body', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: 'Email not registered' }, 400),
      );

      const api = await loadApi();
      await expect(api.requestOtp('unknown@example.com')).rejects.toThrow(
        'Email not registered',
      );
    });

    it('throws generic status message when no error field', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({}, 422),
      );

      const api = await loadApi();
      await expect(api.requestOtp('bad@example.com')).rejects.toThrow(
        'Request failed: 422',
      );
    });
  });

  // ── 8. apiFetch throws generic message for 500+ without server error message ──

  describe('500+ error handling', () => {
    it('throws generic "Service unavailable" for 500+ without error message', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({}, 500),
      );

      const api = await loadApi();
      await expect(api.listRounds()).rejects.toThrow(
        'Service unavailable — please try again later',
      );
    });

    it('throws server message for 500+ when error field is present', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: 'Database connection failed' }, 502),
      );

      const api = await loadApi();
      await expect(api.listRounds()).rejects.toThrow('Database connection failed');
    });

    it('throws generic message when response body is not JSON', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('Internal Server Error', {
          status: 500,
          headers: { 'content-type': 'text/plain' },
        }),
      );

      const api = await loadApi();
      await expect(api.listRounds()).rejects.toThrow(
        'Service unavailable — please try again later',
      );
    });
  });

  // ── 9. listRounds extracts data array from response ──

  describe('listRounds', () => {
    it('extracts data array from response', async () => {
      const rounds = [
        { id: '1', slug: 'series-a', name: 'Series A', status: 'open' },
        { id: '2', slug: 'series-b', name: 'Series B', status: 'closed' },
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: rounds }));

      const api = await loadApi();
      const result = await api.listRounds();

      expect(result).toEqual(rounds);
      expect(result).toHaveLength(2);
    });
  });

  // ── 10. getDocumentDownloadUrl handles binary response (watermarked file) ──

  describe('getDocumentDownloadUrl', () => {
    it('handles binary response for watermarked file', async () => {
      mockToken('my-token');

      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      mockFetch.mockResolvedValueOnce(
        new Response(blob, {
          status: 200,
          headers: {
            'content-type': 'application/pdf',
            'content-disposition': 'attachment; filename="report.pdf"',
          },
        }),
      );

      const api = await loadApi();
      const result = await api.getDocumentDownloadUrl('series-a', 'doc-1');

      expect(result.url).toBeNull();
      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.document.id).toBe('doc-1');
      expect(result.document.name).toBe('report.pdf');
      expect(result.document.mimeType).toBe('application/pdf');
      expect(result.document.watermarkEnabled).toBe(true);
    });

    // ── 11. getDocumentDownloadUrl handles JSON response (presigned URL) ──

    it('handles JSON response with presigned URL', async () => {
      mockToken('my-token');

      const docResponse = {
        url: 'https://s3.amazonaws.com/bucket/doc.pdf?signature=abc',
        document: {
          id: 'doc-1',
          name: 'Financials Q4',
          description: null,
          category: 'financials',
          mimeType: 'application/pdf',
          fileSizeBytes: 1024,
          s3Key: 'rounds/series-a/doc.pdf',
          sortOrder: 1,
          watermarkEnabled: false,
          createdAt: '2026-01-01T00:00:00Z',
        },
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(docResponse));

      const api = await loadApi();
      const result = await api.getDocumentDownloadUrl('series-a', 'doc-1');

      expect(result.url).toBe(docResponse.url);
      expect(result.document.name).toBe('Financials Q4');
      expect(result.blob).toBeUndefined();
    });
  });

  // ── Network failure retry ──

  describe('network failure retry', () => {
    it('retries once on network error then succeeds', async () => {
      mockFetch
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(jsonResponse({ data: [] }));

      const api = await loadApi();
      const promise = api.listRounds();

      await vi.advanceTimersByTimeAsync(1000);

      const result = await promise;
      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws "Service unavailable" after two network failures', async () => {
      mockFetch
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const api = await loadApi();
      const promise = api.listRounds().catch((e: Error) => e);

      await vi.advanceTimersByTimeAsync(2000);

      const error = await promise;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Service unavailable — please try again later');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // ── verifyOtp ──

  describe('verifyOtp', () => {
    it('sends email and code in POST body', async () => {
      const response = {
        token: 'jwt-token',
        investor: { id: '1', email: 'a@b.com', name: 'Alice', firm: null },
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(response));

      const api = await loadApi();
      const result = await api.verifyOtp('a@b.com', '123456');

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe('/auth/ir/portal/otp/verify');
      expect(JSON.parse(options.body as string)).toEqual({ email: 'a@b.com', code: '123456' });
      expect(result.token).toBe('jwt-token');
      expect(result.investor.email).toBe('a@b.com');
    });
  });

  // ── refreshToken ──

  describe('refreshToken', () => {
    it('sends POST to /token/refresh', async () => {
      mockToken('current-token');
      mockFetch.mockResolvedValueOnce(jsonResponse({ token: 'new-token' }));

      const api = await loadApi();
      const result = await api.refreshToken();

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe('/auth/ir/portal/token/refresh');
      expect(options.method).toBe('POST');
      expect(options.headers['Authorization']).toBe('Bearer current-token');
      expect(result.token).toBe('new-token');
    });
  });

  // ── listDocuments ──

  describe('listDocuments', () => {
    it('sends category as query parameter', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));

      const api = await loadApi();
      await api.listDocuments('series-a', 'financials');

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('/auth/ir/portal/rounds/series-a/documents?category=financials');
    });

    it('omits category param when not provided', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));

      const api = await loadApi();
      await api.listDocuments('series-a');

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('/auth/ir/portal/rounds/series-a/documents');
    });
  });

  // ── trackView ──

  describe('trackView', () => {
    it('sends accessLogId and durationSeconds in POST body', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(null, {
          status: 204,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const api = await loadApi();
      await api.trackView('log-abc', 45);

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe('/auth/ir/portal/tracking');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body as string)).toEqual({
        accessLogId: 'log-abc',
        durationSeconds: 45,
      });
    });
  });
});
