import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { render, screen } from '@testing-library/react';
import { PapayaProvider, usePapaya } from './provider';
import { PapayaClient } from '@papaya/sample';
import type { ReactNode } from 'react';

vi.mock('@papaya/sample', () => {
  const MockPapayaClient = vi.fn();
  return { PapayaClient: MockPapayaClient };
});

const defaultConfig = { apiKey: 'test-key', baseUrl: 'https://api.test.com' };

function wrapper({ children }: { children: ReactNode }) {
  return <PapayaProvider config={defaultConfig}>{children}</PapayaProvider>;
}

describe('PapayaProvider', () => {
  it('renders children', () => {
    render(
      <PapayaProvider config={defaultConfig}>
        <div data-testid="child">Hello</div>
      </PapayaProvider>,
    );
    expect(screen.getByTestId('child')).toBeDefined();
    expect(screen.getByTestId('child').textContent).toBe('Hello');
  });

  it('creates a PapayaClient with the provided config', () => {
    renderHook(() => usePapaya(), { wrapper });
    expect(PapayaClient).toHaveBeenCalledWith(defaultConfig);
  });
});

describe('usePapaya', () => {
  it('returns the client when used within PapayaProvider', () => {
    const { result } = renderHook(() => usePapaya(), { wrapper });
    expect(result.current).toBeInstanceOf(PapayaClient);
  });

  it('throws when used outside PapayaProvider', () => {
    expect(() => {
      renderHook(() => usePapaya());
    }).toThrow('usePapaya must be used within a <PapayaProvider>');
  });
});
