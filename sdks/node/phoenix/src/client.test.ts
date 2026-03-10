import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PhoenixClient } from './client';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/** Helper: build a successful GraphQL JSON response. */
function gqlResponse(data: unknown) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Helper: build a GraphQL response with errors. */
function gqlErrorResponse(message: string) {
  return new Response(JSON.stringify({ errors: [{ message }] }), {
    status: 200,
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

const GQL_URL = 'https://banyan.services.papaya.asia/graphql';

describe('PhoenixClient', () => {
  let client: PhoenixClient;

  beforeEach(() => {
    client = new PhoenixClient({ environment: 'production' });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Constructor & environment resolution
  // ═══════════════════════════════════════════════════════════════════════════

  describe('constructor', () => {
    it('resolves production endpoint', () => {
      const c = new PhoenixClient({ environment: 'production' });
      c.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlResponse({ claims: [] }));
      c.listClaims();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://banyan.services.papaya.asia/graphql',
        expect.any(Object),
      );
    });

    it('resolves staging endpoint', () => {
      const c = new PhoenixClient({ environment: 'staging' });
      c.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlResponse({ claims: [] }));
      c.listClaims();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://staging.banyan.services.papaya.asia/graphql',
        expect.any(Object),
      );
    });

    it('resolves uat endpoint', () => {
      const c = new PhoenixClient({ environment: 'uat' });
      c.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlResponse({ claims: [] }));
      c.listClaims();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://uat.banyan.services.papaya.asia/graphql',
        expect.any(Object),
      );
    });

    it('resolves development endpoint', () => {
      const c = new PhoenixClient({ environment: 'development' });
      c.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlResponse({ claims: [] }));
      c.listClaims();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3280/graphql',
        expect.any(Object),
      );
    });

    it('uses custom graphqlUrl override when provided', () => {
      const c = new PhoenixClient({ environment: 'production', graphqlUrl: 'https://custom.example.com/graphql' });
      c.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlResponse({ claims: [] }));
      c.listClaims();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.example.com/graphql',
        expect.any(Object),
      );
    });

    it('strips trailing slash from graphqlUrl', () => {
      const c = new PhoenixClient({ environment: 'production', graphqlUrl: 'https://custom.example.com/graphql/' });
      c.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlResponse({ claims: [] }));
      c.listClaims();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.example.com/graphql',
        expect.any(Object),
      );
    });

    it('uses default timeout of 30 seconds', () => {
      const c = new PhoenixClient({ environment: 'production' });
      expect((c as any).timeout).toBe(30_000);
    });

    it('uses custom timeout when provided', () => {
      const c = new PhoenixClient({ environment: 'production', timeout: 60_000 });
      expect((c as any).timeout).toBe(60_000);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Headers
  // ═══════════════════════════════════════════════════════════════════════════

  describe('headers', () => {
    it('sends Content-Type header', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({ phoenixLogin: { results: [] } }));
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
      mockFetch.mockResolvedValueOnce(gqlResponse({ phoenixLogin: { results: [] } }));
      await client.login(['X']);

      const [, init] = mockFetch.mock.calls[0]!;
      expect(init.headers['Authorization']).toBeUndefined();
    });

    it('sends x-tenant-id header when set', async () => {
      client.setTenantId('tenant-123');
      mockFetch.mockResolvedValueOnce(gqlResponse({ phoenixLogin: { results: [] } }));
      await client.login(['X']);

      const [, init] = mockFetch.mock.calls[0]!;
      expect(init.headers['x-tenant-id']).toBe('tenant-123');
    });

    it('sends x-tenant-id on GraphQL data operations too', async () => {
      client.setToken('tok');
      client.setTenantId('tenant-123');
      mockFetch.mockResolvedValueOnce(gqlResponse({ claims: [] }));
      await client.listClaims();

      const [, init] = mockFetch.mock.calls[0]!;
      expect(init.headers['x-tenant-id']).toBe('tenant-123');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // login (GraphQL mutation)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('login', () => {
    it('sends PhoenixLogin mutation with policy numbers', async () => {
      const mockResults = [
        { policyNumber: 'P-001', success: true, token: 'jwt-1', policy: { id: '1', policyNumber: 'P-001', insuredName: 'Test', status: 'active' } },
      ];
      mockFetch.mockResolvedValueOnce(gqlResponse({ phoenixLogin: { results: mockResults } }));

      const results = await client.login(['P-001']);

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe(GQL_URL);
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body);
      expect(body.query).toContain('PhoenixLogin');
      expect(body.variables).toEqual({ policyNumbers: ['P-001'] });
      expect(results).toEqual(mockResults);
    });

    it('handles multi-policy login', async () => {
      const mockResults = [
        { policyNumber: 'P-001', success: true, token: 'jwt-1', policy: { id: '1', policyNumber: 'P-001', insuredName: 'A', status: 'active' } },
        { policyNumber: 'P-002', success: false, message: 'POLICY_NOT_FOUND' },
      ];
      mockFetch.mockResolvedValueOnce(gqlResponse({ phoenixLogin: { results: mockResults } }));

      const results = await client.login(['P-001', 'P-002']);
      expect(results).toHaveLength(2);
      expect(results[0]!.success).toBe(true);
      expect(results[1]!.success).toBe(false);
    });

    it('handles empty policy numbers array', async () => {
      mockFetch.mockResolvedValueOnce(gqlResponse({ phoenixLogin: { results: [] } }));

      const results = await client.login([]);

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.variables).toEqual({ policyNumbers: [] });
      expect(results).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // refreshToken (GraphQL mutation)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('refreshToken', () => {
    it('sends PhoenixRefreshToken mutation', async () => {
      client.setToken('old-token');
      mockFetch.mockResolvedValueOnce(gqlResponse({ phoenixRefreshToken: { token: 'new-token' } }));

      const result = await client.refreshToken();

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe(GQL_URL);
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body);
      expect(body.query).toContain('PhoenixRefreshToken');
      expect(result.token).toBe('new-token');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // requestOtp / verifyOtp (GraphQL mutations)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('requestOtp', () => {
    it('sends PhoenixRequestOtp mutation', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlResponse({ phoenixRequestOtp: { success: true } }));

      const result = await client.requestOtp('c1');

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe(GQL_URL);
      const body = JSON.parse(init.body);
      expect(body.query).toContain('PhoenixRequestOtp');
      expect(body.variables).toEqual({ claimId: 'c1' });
      expect(result.success).toBe(true);
    });
  });

  describe('verifyOtp', () => {
    it('sends PhoenixVerifyOtp mutation with code', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlResponse({ phoenixVerifyOtp: { success: true, verified: true } }));

      const result = await client.verifyOtp('c1', '123456');

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe(GQL_URL);
      const body = JSON.parse(init.body);
      expect(body.query).toContain('PhoenixVerifyOtp');
      expect(body.variables).toEqual({ claimId: 'c1', code: '123456' });
      expect(result.verified).toBe(true);
    });

    it('handles special characters in OTP code', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlResponse({ phoenixVerifyOtp: { success: true, verified: true } }));

      await client.verifyOtp('c1', '12-34#56');

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(body.variables.code).toBe('12-34#56');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // listClaims
  // ═══════════════════════════════════════════════════════════════════════════

  describe('listClaims', () => {
    it('sends GraphQL query', async () => {
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
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getClaim
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
  // submitClaim
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
  // uploadDocument (GraphQL mutation)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('uploadDocument', () => {
    it('sends PhoenixUploadDocument mutation', async () => {
      client.setToken('tok');
      mockFetch.mockResolvedValueOnce(gqlResponse({
        phoenixUploadDocument: {
          uploadUrl: 'https://s3.example.com/upload',
          document: {
            id: 'doc1', claimId: 'c1', fileName: 'receipt.pdf',
            fileType: 'application/pdf', fileUrl: 'https://s3.example.com/doc1',
            fileSizeBytes: '102400', documentType: 'receipt', createdAt: '2026-01-01',
          },
        },
      }));

      const result = await client.uploadDocument('c1', { fileName: 'receipt.pdf', fileType: 'application/pdf' });

      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe(GQL_URL);
      const body = JSON.parse(init.body);
      expect(body.query).toContain('PhoenixUploadDocument');
      expect(body.variables.claimId).toBe('c1');
      expect(body.variables.fileName).toBe('receipt.pdf');
      expect(body.variables.fileType).toBe('application/pdf');
      expect(result.uploadUrl).toBe('https://s3.example.com/upload');
      expect(result.document.id).toBe('doc1');
      expect(result.document.fileSizeBytes).toBe(102400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getClaimDocuments
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
  // deleteDocument
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
  // Error handling
  // ═══════════════════════════════════════════════════════════════════════════

  describe('error handling', () => {
    it('throws on non-OK HTTP response', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500, 'Internal Server Error'));

      await expect(client.login(['X'])).rejects.toThrow('Phoenix GraphQL error: 500');
    });

    it('throws on 401 response', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(401, 'Unauthorized'));

      await expect(client.login(['X'])).rejects.toThrow('Phoenix GraphQL error: 401');
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

    it('throws on network error', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(client.login(['X'])).rejects.toThrow('Failed to fetch');
    });

    it('aborts request when timeout is reached', async () => {
      const clientWithShortTimeout = new PhoenixClient({
        environment: 'production',
        timeout: 100,
      });

      mockFetch.mockImplementationOnce((_url: string, options: RequestInit) => {
        return new Promise((_resolve, reject) => {
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
        });
      });

      await expect(clientWithShortTimeout.login(['X'])).rejects.toThrow('The operation was aborted.');
    });

    it('clears timeout after successful request', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      mockFetch.mockResolvedValueOnce(gqlResponse({ phoenixLogin: { results: [] } }));

      await client.login(['X']);

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('clears timeout after failed request', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      mockFetch.mockResolvedValueOnce(errorResponse(500));

      await expect(client.login(['X'])).rejects.toThrow('Phoenix GraphQL error: 500');

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Edge cases
  // ═══════════════════════════════════════════════════════════════════════════

  describe('edge cases', () => {
    it('all operations go to the same GraphQL endpoint', async () => {
      client.setToken('tok');

      // Auth mutation
      mockFetch.mockResolvedValueOnce(gqlResponse({ phoenixRequestOtp: { success: true } }));
      await client.requestOtp('c1');
      expect(mockFetch.mock.calls[0]![0]).toBe(GQL_URL);

      // Data query
      mockFetch.mockResolvedValueOnce(gqlResponse({ claims: [] }));
      await client.listClaims();
      expect(mockFetch.mock.calls[1]![0]).toBe(GQL_URL);
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
      mockFetch.mockResolvedValueOnce(gqlResponse({ phoenixLogin: { results: [] } }));

      await client.login(['P-001']);

      const [, init] = mockFetch.mock.calls[0]!;
      expect(init.headers['x-tenant-id']).toBe('tenant-2');
    });

    it('uses POST for all operations', async () => {
      client.setToken('tok');

      mockFetch.mockResolvedValueOnce(gqlResponse({ phoenixLogin: { results: [] } }));
      await client.login(['X']);
      expect(mockFetch.mock.calls[0]![1].method).toBe('POST');

      mockFetch.mockResolvedValueOnce(gqlResponse({ phoenixRefreshToken: { token: 't' } }));
      await client.refreshToken();
      expect(mockFetch.mock.calls[1]![1].method).toBe('POST');

      mockFetch.mockResolvedValueOnce(gqlResponse({ claims: [] }));
      await client.listClaims();
      expect(mockFetch.mock.calls[2]![1].method).toBe('POST');

      mockFetch.mockResolvedValueOnce(gqlResponse({ phoenixRequestOtp: { success: true } }));
      await client.requestOtp('c1');
      expect(mockFetch.mock.calls[3]![1].method).toBe('POST');
    });
  });
});
