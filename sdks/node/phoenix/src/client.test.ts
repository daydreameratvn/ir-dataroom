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

/** Helper: build a successful GraphQL JSON response. */
function gqlResponse(data: unknown) {
  return jsonResponse({ data });
}

/** Helper: build a GraphQL response with errors. */
function gqlErrorResponse(message: string) {
  return jsonResponse({ errors: [{ message }] });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const BASE_URL = 'https://phoenix.papaya.asia';
const GQL_URL = 'https://banyan.services.papaya.asia/graphql';

describe('PhoenixClient', () => {
  let client: PhoenixClient;

  beforeEach(() => {
    client = new PhoenixClient({ baseUrl: BASE_URL, graphqlUrl: GQL_URL });
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

    it('strips trailing slash from graphqlUrl', () => {
      const c = new PhoenixClient({ baseUrl: BASE_URL, graphqlUrl: 'https://gql.example.com/' });
      c.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlResponse({ claims: [] }));
      c.listClaims();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://gql.example.com',
        expect.any(Object),
      );
    });

    it('uses default graphqlUrl when not provided', () => {
      const c = new PhoenixClient({ baseUrl: BASE_URL });
      c.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlResponse({ claims: [] }));
      c.listClaims();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://banyan.services.papaya.asia/graphql',
        expect.any(Object),
      );
    });

    it('uses default timeout of 30 seconds', () => {
      const c = new PhoenixClient({ baseUrl: 'https://example.com' });
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
      mockFetch.mockResolvedValueOnce(gqlResponse({ claims: [] }));
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
      mockFetch.mockResolvedValueOnce(jsonResponse({ results: mockResults }));

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
      mockFetch.mockResolvedValueOnce(jsonResponse({ results: mockResults }));

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
  // listClaims (GraphQL)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('listClaims', () => {
    it('sends GraphQL query to graphqlUrl', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlResponse({ claims: [] }));

      await client.listClaims();

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe(GQL_URL);
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body);
      expect(body.query).toContain('ListClaims');
      expect(body.variables.where).toEqual({ deletedAt: { _is_null: true } });
    });

    it('maps Hasura Bigdecimal strings to numbers', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlResponse({
        claims: [{
          id: 'c1', claimNumber: 'CLM-001', status: 'submitted', policyId: 'p1',
          claimantName: 'Test', providerName: null,
          amountClaimed: '1000000', amountApproved: '500000', amountPaid: null,
          currency: 'VND', dateOfLoss: null, dateOfService: null,
          aiSummary: null, aiRecommendation: null,
          createdAt: '2026-01-01', updatedAt: '2026-01-01',
        }],
      }));

      const result = await client.listClaims();

      expect(result).toHaveLength(1);
      expect(result[0]!.amountClaimed).toBe(1000000);
      expect(result[0]!.amountApproved).toBe(500000);
      expect(result[0]!.amountPaid).toBeNull();
    });

    it('returns empty array when no claims', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlResponse({ claims: [] }));

      const result = await client.listClaims();
      expect(result).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getClaim (GraphQL)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getClaim', () => {
    it('sends GraphQL query with claim ID', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlResponse({
        claimsById: {
          id: 'c1', claimNumber: 'CLM-001', status: 'submitted', policyId: 'p1',
          claimantName: 'Test', providerName: null,
          amountClaimed: '1000', amountApproved: null, amountPaid: null,
          currency: 'VND', dateOfLoss: null, dateOfService: null,
          aiSummary: 'AI summary', aiRecommendation: 'Approve',
          createdAt: '2026-01-01', updatedAt: '2026-01-01',
          claimDocuments: [], claimNotes: [],
        },
      }));

      const result = await client.getClaim('c1');

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe(GQL_URL);
      const body = JSON.parse(init.body);
      expect(body.query).toContain('GetClaimDetail');
      expect(body.variables).toEqual({ id: 'c1' });
      expect(result.id).toBe('c1');
      expect(result.documents).toEqual([]);
      expect(result.notes).toEqual([]);
      expect(result.aiSummary).toBe('AI summary');
      expect(result.aiRecommendation).toBe('Approve');
    });

    it('throws when claim not found', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlResponse({ claimsById: null }));

      await expect(client.getClaim('nonexistent')).rejects.toThrow('Claim nonexistent not found');
    });

    it('maps nested documents and notes', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlResponse({
        claimsById: {
          id: 'c1', claimNumber: 'CLM-001', status: 'submitted', policyId: 'p1',
          claimantName: 'Test', providerName: 'Hospital A',
          amountClaimed: '5000', amountApproved: '4000', amountPaid: '4000',
          currency: 'VND', dateOfLoss: '2026-01-01', dateOfService: '2026-01-02',
          aiSummary: null, aiRecommendation: null,
          createdAt: '2026-01-01', updatedAt: '2026-01-02',
          claimDocuments: [{
            id: 'doc1', claimId: 'c1', fileName: 'receipt.pdf',
            fileType: 'application/pdf', fileUrl: 'https://s3.example.com/doc1',
            fileSizeBytes: '102400', documentType: 'receipt', createdAt: '2026-01-01',
          }],
          claimNotes: [{
            id: 'note1', claimId: 'c1', agentName: 'Agent A',
            content: 'Looks good', noteType: 'review', createdAt: '2026-01-01',
          }],
        },
      }));

      const result = await client.getClaim('c1');

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0]!.fileName).toBe('receipt.pdf');
      expect(result.documents[0]!.fileSizeBytes).toBe(102400);
      expect(result.notes).toHaveLength(1);
      expect(result.notes[0]!.content).toBe('Looks good');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // submitClaim (GraphQL)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('submitClaim', () => {
    it('sends GraphQL mutation with claim data', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlResponse({
        insertClaims: {
          returning: [{
            id: 'c2', claimNumber: 'CLM-123', status: 'submitted', policyId: 'p1',
            claimantName: 'Test', providerName: 'Hospital',
            amountClaimed: '5000', amountApproved: null, amountPaid: null,
            currency: 'VND', dateOfLoss: null, dateOfService: null,
            aiSummary: null, aiRecommendation: null,
            createdAt: '2026-01-01', updatedAt: '2026-01-01',
          }],
        },
      }));

      const input = { claimantName: 'Test', amountClaimed: 5000, currency: 'VND', providerName: 'Hospital' };
      const result = await client.submitClaim(input);

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe(GQL_URL);
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body);
      expect(body.query).toContain('CreateClaim');
      expect(body.variables.objects[0].claimantName).toBe('Test');
      expect(body.variables.objects[0].amountClaimed).toBe(5000);
      expect(body.variables.objects[0].status).toBe('submitted');
      expect(result.id).toBe('c2');
      expect(result.amountClaimed).toBe(5000);
    });

    it('generates a claim number starting with CLM-', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlResponse({
        insertClaims: {
          returning: [{
            id: 'c2', claimNumber: 'CLM-123', status: 'submitted', policyId: 'p1',
            claimantName: 'Test', providerName: null,
            amountClaimed: '1000', amountApproved: null, amountPaid: null,
            currency: 'VND', dateOfLoss: null, dateOfService: null,
            aiSummary: null, aiRecommendation: null,
            createdAt: '2026-01-01', updatedAt: '2026-01-01',
          }],
        },
      }));

      await client.submitClaim({ claimantName: 'Test', amountClaimed: 1000 });

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.variables.objects[0].claimNumber).toMatch(/^CLM-/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // uploadDocument (REST)
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
  // getClaimDocuments (GraphQL)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getClaimDocuments', () => {
    it('sends GraphQL query filtering by claimId', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlResponse({
        claimDocuments: [{
          id: 'doc1', claimId: 'c1', fileName: 'receipt.pdf',
          fileType: 'application/pdf', fileUrl: 'https://s3.example.com/doc1',
          fileSizeBytes: '204800', documentType: 'receipt', createdAt: '2026-01-01',
        }],
      }));

      const result = await client.getClaimDocuments('c1');

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe(GQL_URL);
      const body = JSON.parse(init.body);
      expect(body.query).toContain('GetClaimDocuments');
      expect(body.variables.where.claimId).toEqual({ _eq: 'c1' });
      expect(result).toHaveLength(1);
      expect(result[0]!.fileName).toBe('receipt.pdf');
      expect(result[0]!.fileSizeBytes).toBe(204800);
    });

    it('returns empty array when no documents', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlResponse({ claimDocuments: [] }));

      const result = await client.getClaimDocuments('c1');
      expect(result).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // deleteDocument (GraphQL)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('deleteDocument', () => {
    it('sends soft-delete mutation setting deletedAt', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlResponse({
        updateClaimDocumentsById: { returning: [{ id: 'doc1' }] },
      }));

      const result = await client.deleteDocument('c1', 'doc1');

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe(GQL_URL);
      const body = JSON.parse(init.body);
      expect(body.query).toContain('SoftDeleteDocument');
      expect(body.variables.keyId).toBe('doc1');
      expect(body.variables.updateColumns.deletedAt).toBeDefined();
      expect(result.success).toBe(true);
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

      await expect(client.refreshToken()).rejects.toThrow('Phoenix API error: 500');
    });

    it('throws on non-OK GraphQL HTTP response', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(errorResponse(500, 'Internal Server Error'));

      await expect(client.listClaims()).rejects.toThrow('Phoenix GraphQL error: 500');
    });

    it('throws on GraphQL errors in response body', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlErrorResponse('permission denied'));

      await expect(client.listClaims()).rejects.toThrow('Phoenix GraphQL error: permission denied');
    });

    it('throws on 404 claim not found', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlResponse({ claimsById: null }));

      await expect(client.getClaim('nonexistent')).rejects.toThrow('Claim nonexistent not found');
    });

    it('throws on 422 validation error', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(errorResponse(422, 'Unprocessable Entity'));

      await expect(client.login(['X'])).rejects.toThrow('Phoenix API error: 422 Unprocessable Entity');
    });

    it('throws on network error', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(client.login(['X'])).rejects.toThrow('Failed to fetch');
    });

    it('throws on JSON parse error', async () => {
      mockFetch.mockResolvedValueOnce(new Response('invalid json', { status: 200 }));

      await expect(client.login(['X'])).rejects.toThrow();
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
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      mockFetch.mockResolvedValueOnce(jsonResponse({ results: [] }));

      await client.login(['X']);

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('clears timeout after failed request', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      mockFetch.mockResolvedValueOnce(errorResponse(500));

      await expect(client.login(['X'])).rejects.toThrow('Phoenix API error: 500');

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Edge cases and additional scenarios
  // ═══════════════════════════════════════════════════════════════════════════

  describe('edge cases', () => {
    it('handles empty policy numbers array in login', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ results: [] }));

      const results = await client.login([]);

      const [, init] = mockFetch.mock.calls[0]!;
      expect(JSON.parse(init.body)).toEqual({ policyNumbers: [] });
      expect(results).toEqual([]);
    });

    it('handles special characters in OTP code', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, verified: true }));

      const specialCode = '12-34#56';
      await client.verifyOtp('c1', specialCode);

      const [, init] = mockFetch.mock.calls[0]!;
      expect(JSON.parse(init.body)).toEqual({ code: specialCode });
    });

    it('sends both Authorization and x-tenant-id headers when both are set', async () => {
      client.setToken('my-jwt');
      client.setTenantId('tenant-123');
      mockFetch.mockResolvedValueOnce(jsonResponse({ results: [] }));

      await client.login(['X']);

      const [, init] = mockFetch.mock.calls[0]!;
      expect(init.headers['Authorization']).toBe('Bearer my-jwt');
      expect(init.headers['x-tenant-id']).toBe('tenant-123');
    });

    it('overwrites token when setToken is called multiple times', async () => {
      client.setToken('first-token');
      client.setToken('second-token');
      mockFetch.mockResolvedValueOnce(gqlResponse({ claims: [] }));

      await client.listClaims();

      const [, init] = mockFetch.mock.calls[0]!;
      expect(init.headers['Authorization']).toBe('Bearer second-token');
    });

    it('overwrites tenant ID when setTenantId is called multiple times', async () => {
      client.setTenantId('tenant-1');
      client.setTenantId('tenant-2');
      mockFetch.mockResolvedValueOnce(jsonResponse({ results: [] }));

      await client.login(['P-001']);

      const [, init] = mockFetch.mock.calls[0]!;
      expect(init.headers['x-tenant-id']).toBe('tenant-2');
    });

    it('handles empty document data in uploadDocument', async () => {
      const mockResult = { uploadUrl: 'https://s3.example.com/upload', document: { id: 'doc1', fileName: 'empty.txt' } };
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(jsonResponse(mockResult));

      const result = await client.uploadDocument('c1', { fileName: 'empty.txt', fileType: 'text/plain' });

      const [, init] = mockFetch.mock.calls[0]!;
      expect(JSON.parse(init.body)).toEqual({ fileName: 'empty.txt', fileType: 'text/plain' });
      expect(result).toEqual(mockResult);
    });

    it('handles large file name in uploadDocument', async () => {
      const mockResult = { uploadUrl: 'https://s3.example.com/upload', document: { id: 'doc1', fileName: 'large.pdf' } };
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(jsonResponse(mockResult));

      const result = await client.uploadDocument('c1', { fileName: 'large.pdf', fileType: 'application/pdf' });

      const [, init] = mockFetch.mock.calls[0]!;
      expect(JSON.parse(init.body).fileName).toBe('large.pdf');
      expect(result).toEqual(mockResult);
    });

    it('maps null amountClaimed to 0', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlResponse({
        claims: [{
          id: 'c1', claimNumber: 'CLM-001', status: 'submitted', policyId: 'p1',
          claimantName: null, providerName: null,
          amountClaimed: null, amountApproved: null, amountPaid: null,
          currency: null, dateOfLoss: null, dateOfService: null,
          aiSummary: null, aiRecommendation: null,
          createdAt: '2026-01-01', updatedAt: '2026-01-01',
        }],
      }));

      const result = await client.listClaims();
      expect(result[0]!.amountClaimed).toBe(0);
      expect(result[0]!.claimantName).toBe('');
      expect(result[0]!.currency).toBe('VND');
    });

    it('GraphQL calls go to graphqlUrl, REST calls go to baseUrl', async () => {
      client.setToken('tok');
      // GraphQL call
      mockFetch.mockResolvedValueOnce(gqlResponse({ claims: [] }));
      await client.listClaims();
      expect(mockFetch.mock.calls[0]![0]).toBe(GQL_URL);

      // REST call
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));
      await client.requestOtp('c1');
      expect(mockFetch.mock.calls[1]![0]).toBe(`${BASE_URL}/auth/phoenix/claims/c1/otp/request`);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HTTP method verification
  // ═══════════════════════════════════════════════════════════════════════════

  describe('HTTP methods', () => {
    beforeEach(() => {
      client.setToken('test-token');
    });

    it('uses POST for all GraphQL data operations', async () => {
      // listClaims
      mockFetch.mockResolvedValueOnce(gqlResponse({ claims: [] }));
      await client.listClaims();
      expect(mockFetch.mock.calls[0]![1].method).toBe('POST');

      // getClaim
      mockFetch.mockResolvedValueOnce(gqlResponse({
        claimsById: {
          id: 'c1', claimNumber: 'CLM-001', status: 'submitted', policyId: 'p1',
          claimantName: 'Test', providerName: null,
          amountClaimed: '0', amountApproved: null, amountPaid: null,
          currency: 'VND', dateOfLoss: null, dateOfService: null,
          aiSummary: null, aiRecommendation: null,
          createdAt: '2026-01-01', updatedAt: '2026-01-01',
          claimDocuments: [], claimNotes: [],
        },
      }));
      await client.getClaim('c1');
      expect(mockFetch.mock.calls[1]![1].method).toBe('POST');

      // getClaimDocuments
      mockFetch.mockResolvedValueOnce(gqlResponse({ claimDocuments: [] }));
      await client.getClaimDocuments('c1');
      expect(mockFetch.mock.calls[2]![1].method).toBe('POST');

      // deleteDocument
      mockFetch.mockResolvedValueOnce(gqlResponse({ updateClaimDocumentsById: { returning: [{ id: 'doc1' }] } }));
      await client.deleteDocument('c1', 'doc1');
      expect(mockFetch.mock.calls[3]![1].method).toBe('POST');
    });

    it('uses POST for login', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ results: [] }));

      await client.login(['P-001']);

      const [, init] = mockFetch.mock.calls[0]!;
      expect(init.method).toBe('POST');
    });

    it('uses POST for refreshToken', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ token: 'new-token' }));

      await client.refreshToken();

      const [, init] = mockFetch.mock.calls[0]!;
      expect(init.method).toBe('POST');
    });

    it('uses POST for submitClaim', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({
        insertClaims: {
          returning: [{
            id: 'c1', claimNumber: 'CLM-001', status: 'submitted', policyId: 'p1',
            claimantName: 'Test', providerName: null,
            amountClaimed: '1000', amountApproved: null, amountPaid: null,
            currency: 'USD', dateOfLoss: null, dateOfService: null,
            aiSummary: null, aiRecommendation: null,
            createdAt: '2026-01-01', updatedAt: '2026-01-01',
          }],
        },
      }));

      await client.submitClaim({ claimantName: 'Test', amountClaimed: 1000, currency: 'USD' });

      const [, init] = mockFetch.mock.calls[0]!;
      expect(init.method).toBe('POST');
    });

    it('uses POST for uploadDocument', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ uploadUrl: 'https://example.com' }));

      await client.uploadDocument('c1', { fileName: 'test.pdf', fileType: 'application/pdf' });

      const [, init] = mockFetch.mock.calls[0]!;
      expect(init.method).toBe('POST');
    });

    it('uses POST for requestOtp', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

      await client.requestOtp('c1');

      const [, init] = mockFetch.mock.calls[0]!;
      expect(init.method).toBe('POST');
    });

    it('uses POST for verifyOtp', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, verified: true }));

      await client.verifyOtp('c1', '123456');

      const [, init] = mockFetch.mock.calls[0]!;
      expect(init.method).toBe('POST');
    });
  });
});
