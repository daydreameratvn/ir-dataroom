import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import AuthGuard from './AuthGuard';

// Mock auth provider
const mockUseInvestorAuth = vi.fn();

vi.mock('@/providers/InvestorAuthProvider', () => ({
  useInvestorAuth: () => mockUseInvestorAuth(),
}));

function renderWithAuth(initialEntries = ['/protected']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route element={<AuthGuard />}>
          <Route path="/protected" element={<div>Protected Content</div>} />
        </Route>
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Renders location state so tests can verify redirect-back data */
function LoginPage() {
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from;
  return (
    <div>
      <span>Login Page</span>
      <span data-testid="from-pathname">{from?.pathname ?? 'none'}</span>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AuthGuard', () => {
  it('renders child Outlet when authenticated', () => {
    mockUseInvestorAuth.mockReturnValue({
      isAuthenticated: true,
      investor: { id: 'inv-1', email: 'test@example.com', name: 'Test', firm: null },
      token: 'mock-token',
      login: vi.fn(),
      logout: vi.fn(),
      getToken: () => 'mock-token',
    });

    renderWithAuth();

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('redirects to /login when not authenticated', () => {
    mockUseInvestorAuth.mockReturnValue({
      isAuthenticated: false,
      investor: null,
      token: null,
      login: vi.fn(),
      logout: vi.fn(),
      getToken: () => null,
    });

    renderWithAuth();

    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('passes location state for redirect-back', () => {
    mockUseInvestorAuth.mockReturnValue({
      isAuthenticated: false,
      investor: null,
      token: null,
      login: vi.fn(),
      logout: vi.fn(),
      getToken: () => null,
    });

    renderWithAuth(['/protected']);

    expect(screen.getByTestId('from-pathname').textContent).toBe('/protected');
  });
});
