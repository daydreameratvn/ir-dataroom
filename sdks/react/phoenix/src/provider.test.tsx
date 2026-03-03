import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { type ReactNode } from 'react';
import { PhoenixProvider, usePhoenix } from './provider';

// ---------------------------------------------------------------------------
// Mock PhoenixClient
// ---------------------------------------------------------------------------

const mockLogin = vi.fn();
const mockSetToken = vi.fn();
const mockSetTenantId = vi.fn();
const mockListClaims = vi.fn();
const mockGetClaim = vi.fn();

vi.mock('@papaya/phoenix', () => ({
  PhoenixClient: vi.fn().mockImplementation(() => ({
    login: mockLogin,
    setToken: mockSetToken,
    setTenantId: mockSetTenantId,
    listClaims: mockListClaims,
    getClaim: mockGetClaim,
    refreshToken: vi.fn(),
    submitClaim: vi.fn(),
    uploadDocument: vi.fn(),
    requestOtp: vi.fn(),
    verifyOtp: vi.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Wrapper
// ---------------------------------------------------------------------------

function createWrapper(tenantId?: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <PhoenixProvider config={{ baseUrl: 'https://test.example.com' }} tenantId={tenantId}>
        {children}
      </PhoenixProvider>
    );
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PhoenixProvider + usePhoenix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('provides a client instance', () => {
    const { result } = renderHook(() => usePhoenix(), { wrapper: createWrapper() });
    expect(result.current.client).toBeTruthy();
  });

  it('starts unauthenticated with no policies', () => {
    const { result } = renderHook(() => usePhoenix(), { wrapper: createWrapper() });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.policies).toEqual([]);
    expect(result.current.activePolicy).toBeNull();
  });

  it('throws when usePhoenix is used outside provider', () => {
    expect(() => {
      renderHook(() => usePhoenix());
    }).toThrow('usePhoenix must be used within a <PhoenixProvider>');
  });

  describe('login', () => {
    it('sets policies and token on successful login', async () => {
      const loginResults = [
        {
          policyNumber: 'P-001',
          success: true,
          token: 'jwt-1',
          policy: { id: '1', policyNumber: 'P-001', insuredName: 'User A', status: 'active' },
        },
      ];
      mockLogin.mockResolvedValueOnce(loginResults);

      const { result } = renderHook(() => usePhoenix(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.login(['P-001']);
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.policies).toHaveLength(1);
      expect(result.current.activePolicy?.policyNumber).toBe('P-001');
      expect(mockSetToken).toHaveBeenCalledWith('jwt-1');
    });

    it('handles multi-policy login and activates first', async () => {
      const loginResults = [
        {
          policyNumber: 'P-001',
          success: true,
          token: 'jwt-1',
          policy: { id: '1', policyNumber: 'P-001', insuredName: 'User A', status: 'active' },
        },
        {
          policyNumber: 'P-002',
          success: true,
          token: 'jwt-2',
          policy: { id: '2', policyNumber: 'P-002', insuredName: 'User B', status: 'active' },
        },
      ];
      mockLogin.mockResolvedValueOnce(loginResults);

      const { result } = renderHook(() => usePhoenix(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.login(['P-001', 'P-002']);
      });

      expect(result.current.policies).toHaveLength(2);
      expect(result.current.activePolicy?.policyNumber).toBe('P-001');
    });

    it('ignores failed policies', async () => {
      const loginResults = [
        { policyNumber: 'P-001', success: false, message: 'POLICY_NOT_FOUND' },
      ];
      mockLogin.mockResolvedValueOnce(loginResults);

      const { result } = renderHook(() => usePhoenix(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.login(['P-001']);
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.policies).toHaveLength(0);
    });
  });

  describe('switchPolicy', () => {
    it('switches active policy and token', async () => {
      const loginResults = [
        { policyNumber: 'P-001', success: true, token: 'jwt-1', policy: { id: '1', policyNumber: 'P-001', insuredName: 'A', status: 'active' } },
        { policyNumber: 'P-002', success: true, token: 'jwt-2', policy: { id: '2', policyNumber: 'P-002', insuredName: 'B', status: 'active' } },
      ];
      mockLogin.mockResolvedValueOnce(loginResults);

      const { result } = renderHook(() => usePhoenix(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.login(['P-001', 'P-002']);
      });

      expect(result.current.activePolicy?.policyNumber).toBe('P-001');

      act(() => {
        result.current.switchPolicy('P-002');
      });

      expect(result.current.activePolicy?.policyNumber).toBe('P-002');
      expect(mockSetToken).toHaveBeenLastCalledWith('jwt-2');
    });

    it('ignores switch to unknown policy', async () => {
      const loginResults = [
        { policyNumber: 'P-001', success: true, token: 'jwt-1', policy: { id: '1', policyNumber: 'P-001', insuredName: 'A', status: 'active' } },
      ];
      mockLogin.mockResolvedValueOnce(loginResults);

      const { result } = renderHook(() => usePhoenix(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.login(['P-001']);
      });

      act(() => {
        result.current.switchPolicy('UNKNOWN');
      });

      // Should still be on P-001
      expect(result.current.activePolicy?.policyNumber).toBe('P-001');
    });
  });

  describe('logout', () => {
    it('clears all state', async () => {
      const loginResults = [
        { policyNumber: 'P-001', success: true, token: 'jwt-1', policy: { id: '1', policyNumber: 'P-001', insuredName: 'A', status: 'active' } },
      ];
      mockLogin.mockResolvedValueOnce(loginResults);

      const { result } = renderHook(() => usePhoenix(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.login(['P-001']);
      });

      expect(result.current.isAuthenticated).toBe(true);

      act(() => {
        result.current.logout();
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.policies).toEqual([]);
      expect(result.current.activePolicy).toBeNull();
    });
  });

  describe('tenantId', () => {
    it('passes tenantId to client on init', () => {
      renderHook(() => usePhoenix(), { wrapper: createWrapper('tenant-abc') });
      expect(mockSetTenantId).toHaveBeenCalledWith('tenant-abc');
    });
  });
});
