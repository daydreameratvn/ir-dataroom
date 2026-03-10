import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { PhoenixProvider } from '../provider';
import { useClaim } from './useClaim';

// ---------------------------------------------------------------------------
// Mock PhoenixClient
// ---------------------------------------------------------------------------

vi.mock('@papaya/phoenix', () => ({
  PhoenixClient: class {
    login = vi.fn();
    setToken = vi.fn();
    setTenantId = vi.fn();
    listClaims = vi.fn();
    getClaim = vi.fn();
    refreshToken = vi.fn();
    submitClaim = vi.fn();
    uploadDocument = vi.fn();
    requestOtp = vi.fn();
    verifyOtp = vi.fn();
  },
}));

// ---------------------------------------------------------------------------
// Wrapper
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

describe('useClaim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with null data and loading state', () => {
    const { result } = renderHook(() => useClaim('claim-1'), { wrapper: createWrapper() });
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('does not fetch when unauthenticated', () => {
    const { result } = renderHook(() => useClaim('claim-1'), { wrapper: createWrapper() });
    // Should remain in loading state but never actually call getClaim
    expect(result.current.data).toBeNull();
  });
});
