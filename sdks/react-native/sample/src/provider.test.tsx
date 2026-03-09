import { describe, it, expect, vi } from 'vitest';
import { renderHook, render, screen } from '@testing-library/react';
import { PapayaProvider, usePapaya } from './provider';
import type { PapayaConfig } from '@papaya/sample';
import type { ReactNode } from 'react';

vi.mock('@papaya/sample', () => {
  class MockPapayaClient {
    config: PapayaConfig;
    getClaim = vi.fn();
    listClaims = vi.fn();
    getFWAAlert = vi.fn();
    listFWAAlerts = vi.fn();

    constructor(config: PapayaConfig) {
      this.config = config;
    }
  }

  return { PapayaClient: MockPapayaClient };
});

const TEST_CONFIG: PapayaConfig = {
  apiKey: 'test-api-key',
  baseUrl: 'https://test.papaya.ai/v1',
};

function createWrapper(config: PapayaConfig) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <PapayaProvider config={config}>{children}</PapayaProvider>;
  };
}

describe('PapayaProvider', () => {
  it('renders children', () => {
    render(
      <PapayaProvider config={TEST_CONFIG}>
        <div data-testid="child">Hello</div>
      </PapayaProvider>,
    );

    expect(screen.getByTestId('child')).toBeDefined();
    expect(screen.getByTestId('child').textContent).toBe('Hello');
  });
});

describe('usePapaya', () => {
  it('returns a PapayaClient instance when inside provider', () => {
    const { result } = renderHook(() => usePapaya(), {
      wrapper: createWrapper(TEST_CONFIG),
    });

    expect(result.current).toBeDefined();
    expect(result.current.getClaim).toBeDefined();
    expect(result.current.listClaims).toBeDefined();
    expect(result.current.getFWAAlert).toBeDefined();
    expect(result.current.listFWAAlerts).toBeDefined();
  });

  it('throws error when used outside provider', () => {
    expect(() => {
      renderHook(() => usePapaya());
    }).toThrow('usePapaya must be used within a <PapayaProvider>');
  });
});
