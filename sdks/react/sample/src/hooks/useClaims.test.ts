import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createElement } from 'react';

const mockListClaims = vi.fn();
const mockGetClaim = vi.fn();

vi.mock('@papaya/sample', () => ({
  PapayaClient: class {
    listClaims = mockListClaims;
    getClaim = mockGetClaim;
  },
}));

import { PapayaProvider } from '../provider';
import { useClaims, useClaim } from './useClaims';
import type { ClaimData } from '@papaya/sample';

const defaultConfig = { apiKey: 'test-key', baseUrl: 'https://api.test.com' };

function wrapper({ children }: { children: ReactNode }) {
  return createElement(PapayaProvider, { config: defaultConfig, children });
}

const mockClaim: ClaimData = {
  id: '1',
  claimId: 'CLM-001',
  status: 'submitted',
  amount: 1500,
  currency: 'USD',
  submittedAt: '2026-01-15T10:00:00Z',
};

const mockClaims: ClaimData[] = [
  mockClaim,
  {
    id: '2',
    claimId: 'CLM-002',
    status: 'approved',
    amount: 2500,
    currency: 'USD',
    submittedAt: '2026-01-16T10:00:00Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useClaims', () => {
  it('fetches claims on mount and returns data', async () => {
    mockListClaims.mockResolvedValue({ data: mockClaims, total: 2 });

    const { result } = renderHook(() => useClaims(), { wrapper });

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(mockClaims);
    expect(result.current.total).toBe(2);
    expect(result.current.error).toBeNull();
    expect(mockListClaims).toHaveBeenCalledWith(1, 20);
  });

  it('passes custom page and pageSize', async () => {
    mockListClaims.mockResolvedValue({ data: [], total: 0 });

    const { result } = renderHook(() => useClaims(3, 10), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockListClaims).toHaveBeenCalledWith(3, 10);
  });

  it('sets error when fetch fails', async () => {
    mockListClaims.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useClaims(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error!.message).toBe('Network error');
    expect(result.current.data).toEqual([]);
  });

  it('wraps non-Error rejections in an Error', async () => {
    mockListClaims.mockRejectedValue('string error');

    const { result } = renderHook(() => useClaims(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error!.message).toBe('string error');
  });

  it('supports refetch', async () => {
    mockListClaims.mockResolvedValueOnce({ data: mockClaims, total: 2 });

    const { result } = renderHook(() => useClaims(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const updatedClaims = [mockClaims[0]!];
    mockListClaims.mockResolvedValueOnce({ data: updatedClaims, total: 1 });

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.data).toEqual(updatedClaims);
    expect(result.current.total).toBe(1);
    expect(mockListClaims).toHaveBeenCalledTimes(2);
  });

  it('clears error on refetch', async () => {
    mockListClaims.mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useClaims(), { wrapper });

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    mockListClaims.mockResolvedValueOnce({ data: mockClaims, total: 2 });

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual(mockClaims);
  });
});

describe('useClaim', () => {
  it('fetches a single claim by ID', async () => {
    mockGetClaim.mockResolvedValue(mockClaim);

    const { result } = renderHook(() => useClaim('CLM-001'), { wrapper });

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(mockClaim);
    expect(result.current.error).toBeNull();
    expect(mockGetClaim).toHaveBeenCalledWith('CLM-001');
  });

  it('sets error when fetch fails', async () => {
    mockGetClaim.mockRejectedValue(new Error('Not found'));

    const { result } = renderHook(() => useClaim('CLM-999'), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error!.message).toBe('Not found');
    expect(result.current.data).toBeNull();
  });

  it('wraps non-Error rejections in an Error', async () => {
    mockGetClaim.mockRejectedValue('string error');

    const { result } = renderHook(() => useClaim('CLM-001'), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error!.message).toBe('string error');
  });
});
