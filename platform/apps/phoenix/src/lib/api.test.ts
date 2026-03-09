import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { login, refreshToken, listClaims, getClaimDetail, createClaim, getUploadUrl, requestOtp, verifyOtp } from './api';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock localStorage
const store = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => store.delete(key),
  clear: () => store.clear(),
  get length() { return store.size; },
  key: (_i: number) => null,
};
vi.stubGlobal('localStorage', mockLocalStorage);

// Mock window.location
const locationMock = { href: '' };
vi.stubGlobal('window', { location: locationMock, localStorage: mockLocalStorage });

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Phoenix API', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    store.clear();
    locationMock.href = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('auth header', () => {
    it('includes Bearer token when active policy exists', async () => {
      store.set('phoenix_active_policy', 'POL-001');
      store.set('phoenix_token_POL-001', 'my-token');
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));

      await listClaims();
      const [, init] = mockFetch.mock.calls[0]!;
      expect(init.headers.Authorization).toBe('Bearer my-token');
    });

    it('omits auth header when no active policy', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));
      await listClaims();
      const [, init] = mockFetch.mock.calls[0]!;
      expect(init.headers.Authorization).toBeUndefined();
    });
  });

  describe('login', () => {
    it('sends POST with policy numbers and returns results', async () => {
      const results = [{ policyNumber: 'P1', success: true, token: 'tok' }];
      mockFetch.mockResolvedValueOnce(jsonResponse({ results }));

      const res = await login(['P1']);
      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe('/auth/phoenix/login');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ policyNumbers: ['P1'] });
      expect(res).toEqual(results);
    });
  });

  describe('refreshToken', () => {
    it('sends POST to refresh endpoint', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ token: 'new-tok' }));
      const res = await refreshToken();
      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe('/auth/phoenix/token/refresh');
      expect(init.method).toBe('POST');
      expect(res.token).toBe('new-tok');
    });
  });

  describe('listClaims', () => {
    it('fetches claims and unwraps data', async () => {
      const claims = [{ id: '1', claimNumber: 'CLM-1', status: 'open' }];
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: claims }));
      const res = await listClaims();
      expect(res).toEqual(claims);
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('/auth/phoenix/claims');
    });
  });

  describe('getClaimDetail', () => {
    it('fetches claim with encoded ID', async () => {
      const detail = { id: '1', claimNumber: 'CLM-1', documents: [], notes: [] };
      mockFetch.mockResolvedValueOnce(jsonResponse(detail));
      await getClaimDetail('claim/special');
      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe('/auth/phoenix/claims/claim%2Fspecial');
    });
  });

  describe('createClaim', () => {
    it('sends POST with claim data', async () => {
      const input = { claimantName: 'John', amountClaimed: 500 };
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'c1', ...input }));
      await createClaim(input);
      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe('/auth/phoenix/claims');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual(input);
    });
  });

  describe('getUploadUrl', () => {
    it('sends POST for upload URL', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ uploadUrl: 'https://s3/upload', document: { id: 'd1' } }));
      await getUploadUrl('c1', { fileName: 'doc.pdf', fileType: 'application/pdf' });
      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe('/auth/phoenix/claims/c1/documents');
      expect(init.method).toBe('POST');
    });
  });

  describe('requestOtp', () => {
    it('sends POST to request OTP', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));
      const res = await requestOtp('c1');
      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe('/auth/phoenix/claims/c1/otp/request');
      expect(init.method).toBe('POST');
      expect(res.success).toBe(true);
    });
  });

  describe('verifyOtp', () => {
    it('sends POST with OTP code', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, verified: true }));
      const res = await verifyOtp('c1', '123456');
      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe('/auth/phoenix/claims/c1/otp/verify');
      expect(JSON.parse(init.body)).toEqual({ code: '123456' });
      expect(res.verified).toBe(true);
    });
  });

  describe('error handling', () => {
    it('clears localStorage and redirects on 401', async () => {
      store.set('phoenix_active_policy', 'POL-001');
      mockFetch.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
      await expect(listClaims()).rejects.toThrow('Unauthorized');
      expect(store.has('phoenix_active_policy')).toBe(false);
      expect(locationMock.href).toBe('/login');
    });

    it('throws error message from response body', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'Claim not found' }, 404));
      await expect(getClaimDetail('bad')).rejects.toThrow('Claim not found');
    });

    it('falls back to statusText when body parse fails', async () => {
      mockFetch.mockResolvedValueOnce(new Response('not json', { status: 500, statusText: 'Internal Server Error' }));
      await expect(listClaims()).rejects.toThrow('Internal Server Error');
    });
  });
});
