import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { InvestorAuthProvider, useInvestorAuth } from './InvestorAuthProvider';
import type { Investor } from './InvestorAuthProvider';
import type { ReactNode } from 'react';

const TOKEN_KEY = 'investor_token';
const INVESTOR_KEY = 'investor_info';

const testInvestor: Investor = {
  id: 'inv-001',
  email: 'alice@example.com',
  name: 'Alice',
  firm: 'Acme Capital',
};

// Create a proper localStorage mock since jsdom's localStorage may be incomplete
let store: Record<string, string> = {};

const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
  clear: vi.fn(() => {
    store = {};
  }),
  get length() {
    return Object.keys(store).length;
  },
  key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

function wrapper({ children }: { children: ReactNode }) {
  return <InvestorAuthProvider>{children}</InvestorAuthProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  store = {};
});

describe('InvestorAuthProvider', () => {
  it('provides isAuthenticated=false when no token in localStorage', () => {
    const { result } = renderHook(() => useInvestorAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.token).toBeNull();
    expect(result.current.investor).toBeNull();
  });

  it('provides isAuthenticated=true when token and investor exist in localStorage', () => {
    store[TOKEN_KEY] = 'my-token';
    store[INVESTOR_KEY] = JSON.stringify(testInvestor);

    const { result } = renderHook(() => useInvestorAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.token).toBe('my-token');
    expect(result.current.investor).toEqual(testInvestor);
  });

  it('login() stores token and investor, sets isAuthenticated=true', () => {
    const { result } = renderHook(() => useInvestorAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(false);

    act(() => {
      result.current.login('new-token', testInvestor);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.token).toBe('new-token');
    expect(result.current.investor).toEqual(testInvestor);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(TOKEN_KEY, 'new-token');
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      INVESTOR_KEY,
      JSON.stringify(testInvestor),
    );
  });

  it('logout() removes token and investor, sets isAuthenticated=false', () => {
    store[TOKEN_KEY] = 'existing-token';
    store[INVESTOR_KEY] = JSON.stringify(testInvestor);

    const { result } = renderHook(() => useInvestorAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(true);

    act(() => {
      result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.token).toBeNull();
    expect(result.current.investor).toBeNull();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(TOKEN_KEY);
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(INVESTOR_KEY);
  });

  it('getToken() returns current token from localStorage', () => {
    store[TOKEN_KEY] = 'stored-token';

    const { result } = renderHook(() => useInvestorAuth(), { wrapper });

    expect(result.current.getToken()).toBe('stored-token');
  });

  it('handles corrupt JSON in localStorage for investor gracefully', () => {
    store[TOKEN_KEY] = 'some-token';
    store[INVESTOR_KEY] = '{not valid json!!!';

    const { result } = renderHook(() => useInvestorAuth(), { wrapper });

    expect(result.current.investor).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('useInvestorAuth throws when used outside provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useInvestorAuth());
    }).toThrow('useInvestorAuth must be used within InvestorAuthProvider');

    spy.mockRestore();
  });

  it('responds to storage events from other tabs (token removed externally)', () => {
    store[TOKEN_KEY] = 'tab-token';
    store[INVESTOR_KEY] = JSON.stringify(testInvestor);

    const { result } = renderHook(() => useInvestorAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(true);

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: TOKEN_KEY,
          newValue: null,
          oldValue: 'tab-token',
        }),
      );
    });

    expect(result.current.token).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('responds to storage events from other tabs (investor updated externally)', () => {
    store[TOKEN_KEY] = 'tab-token';
    store[INVESTOR_KEY] = JSON.stringify(testInvestor);

    const { result } = renderHook(() => useInvestorAuth(), { wrapper });

    const updatedInvestor: Investor = {
      ...testInvestor,
      name: 'Alice Updated',
    };

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: INVESTOR_KEY,
          newValue: JSON.stringify(updatedInvestor),
          oldValue: JSON.stringify(testInvestor),
        }),
      );
    });

    expect(result.current.investor).toEqual(updatedInvestor);
  });

  it('responds to storage events with corrupt investor JSON gracefully', () => {
    store[TOKEN_KEY] = 'tab-token';
    store[INVESTOR_KEY] = JSON.stringify(testInvestor);

    const { result } = renderHook(() => useInvestorAuth(), { wrapper });

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: INVESTOR_KEY,
          newValue: '{corrupt json',
          oldValue: JSON.stringify(testInvestor),
        }),
      );
    });

    expect(result.current.investor).toBeNull();
  });
});
