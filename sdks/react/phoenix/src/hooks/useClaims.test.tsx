import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { PhoenixProvider } from '../provider';
import { useClaims } from './useClaims';

// ---------------------------------------------------------------------------
// Mock PhoenixClient
// ---------------------------------------------------------------------------

const mockListClaims = vi.fn();
const mockLogin = vi.fn();
const mockSetToken = vi.fn();

vi.mock('@papaya/phoenix', () => ({
  PhoenixClient: class {
    login = mockLogin;
    setToken = mockSetToken;
    setTenantId = vi.fn();
    listClaims = mockListClaims;
    getClaim = vi.fn();
    refreshToken = vi.fn();
    submitClaim = vi.fn();
    uploadDocument = vi.fn();
    requestOtp = vi.fn();
    verifyOtp = vi.fn();
  },
}));

// ---------------------------------------------------------------------------
// Wrapper — unauthenticated by default
// ---------------------------------------------------------------------------

function createWrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <PhoenixProvider config={{ baseUrl: 'https://test.example.com' }}>
        {children}
      </PhoenixProvider>
    );
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useClaims', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch when unauthenticated', async () => {
    const { result } = renderHook(() => useClaims(), { wrapper: createWrapper() });

    // Wait a tick to ensure any promises settle
    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    expect(mockListClaims).not.toHaveBeenCalled();
  });

  it('returns empty data initially', () => {
    const { result } = renderHook(() => useClaims(), { wrapper: createWrapper() });
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});
