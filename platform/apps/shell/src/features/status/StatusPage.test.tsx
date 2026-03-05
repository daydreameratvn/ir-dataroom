import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TestWrapper, { ensureI18n } from '@/test/wrapper';
import type { StatusResponse } from './types';

// Mock useAuth to control admin state — returns a plain object, no delegation to original
const mockUser = { current: null as Record<string, unknown> | null };
vi.mock('@papaya/auth', async () => {
  const { createContext } = await import('react');
  return {
    AuthContext: createContext(null),
    useAuth: () => ({
      user: mockUser.current,
      session: null,
      isLoading: false,
      isAuthenticated: !!mockUser.current,
      isImpersonating: false,
      impersonation: null,
      signIn: vi.fn(),
      signOut: vi.fn(),
      startImpersonation: vi.fn(),
      endImpersonation: vi.fn(),
    }),
    AuthProvider: ({ children }: { children: unknown }) => children,
  };
});

// Mock the API calls in admin panels
vi.mock('./api', () => ({
  fetchStatus: vi.fn(),
  listIncidents: vi.fn().mockResolvedValue({ data: [], total: 0, hasMore: false }),
  listOverrides: vi.fn().mockResolvedValue({ overrides: [] }),
  createIncident: vi.fn(),
  resolveIncident: vi.fn(),
  deleteIncident: vi.fn(),
  getIncident: vi.fn(),
  setOverride: vi.fn(),
  clearOverride: vi.fn(),
  postIncidentUpdate: vi.fn(),
}));

const mockStatusResponse: StatusResponse = {
  services: [
    { name: 'Platform', status: 'operational', latencyMs: 42 },
    { name: 'Authentication', status: 'operational', latencyMs: 0 },
    { name: 'API Gateway', status: 'operational', latencyMs: 150 },
    { name: 'AI Agents', status: 'operational', latencyMs: 800 },
    { name: 'Database', status: 'operational', latencyMs: 5 },
  ],
  incidents: [],
  uptimeHistory: [],
  overrides: [],
  checkedAt: '2026-02-28T12:00:00Z',
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  await ensureI18n();
  mockUser.current = null;

  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockStatusResponse),
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Lazy import to ensure mocks are applied first
async function importStatusPage() {
  const mod = await import('./StatusPage');
  return mod.default;
}

describe('StatusPage', () => {
  it('renders page header with h1', async () => {
    const StatusPage = await importStatusPage();

    render(
      <TestWrapper>
        <StatusPage />
      </TestWrapper>,
    );

    // Check for the heading element (i18n may or may not resolve the key)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('renders StatusPageContent with services', async () => {
    const StatusPage = await importStatusPage();

    render(
      <TestWrapper>
        <StatusPage />
      </TestWrapper>,
    );

    // Wait for services to load (data-driven, not i18n)
    await waitFor(() => {
      expect(screen.getByText('Platform')).toBeInTheDocument();
    });
  });

  it('does NOT show admin panels for non-admin users', async () => {
    mockUser.current = {
      id: 'user-1',
      email: 'staff@test.com',
      name: 'Staff User',
      userType: 'insurer',
      userLevel: 'staff',
      tenantId: 'test-tenant',
    };
    const StatusPage = await importStatusPage();

    render(
      <TestWrapper>
        <StatusPage />
      </TestWrapper>,
    );

    // Wait for services to load
    await waitFor(() => {
      expect(screen.getByText('Platform')).toBeInTheDocument();
    });

    expect(screen.queryByText('Incident Management')).not.toBeInTheDocument();
    expect(screen.queryByText('Service Overrides')).not.toBeInTheDocument();
  });

  it('shows admin panels for admin users', async () => {
    mockUser.current = {
      id: 'admin-1',
      email: 'admin@test.com',
      name: 'Admin User',
      userType: 'papaya',
      userLevel: 'admin',
      tenantId: 'test-tenant',
    };
    const StatusPage = await importStatusPage();

    render(
      <TestWrapper>
        <StatusPage />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Incident Management')).toBeInTheDocument();
    });

    expect(screen.getByText('Service Overrides')).toBeInTheDocument();
  });

  it('shows Create Incident button for admins', async () => {
    mockUser.current = {
      id: 'admin-1',
      email: 'admin@test.com',
      name: 'Admin User',
      userType: 'papaya',
      userLevel: 'admin',
      tenantId: 'test-tenant',
    };
    const StatusPage = await importStatusPage();

    render(
      <TestWrapper>
        <StatusPage />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create incident/i })).toBeInTheDocument();
    });
  });

  it('shows Add Override button for admins', async () => {
    mockUser.current = {
      id: 'admin-1',
      email: 'admin@test.com',
      name: 'Admin User',
      userType: 'papaya',
      userLevel: 'admin',
      tenantId: 'test-tenant',
    };
    const StatusPage = await importStatusPage();

    render(
      <TestWrapper>
        <StatusPage />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add override/i })).toBeInTheDocument();
    });
  });

  it('does NOT show admin panels when user is null', async () => {
    mockUser.current = null;
    const StatusPage = await importStatusPage();

    render(
      <TestWrapper>
        <StatusPage />
      </TestWrapper>,
    );

    // Wait for services to load
    await waitFor(() => {
      expect(screen.getByText('Platform')).toBeInTheDocument();
    });

    expect(screen.queryByText('Incident Management')).not.toBeInTheDocument();
    expect(screen.queryByText('Service Overrides')).not.toBeInTheDocument();
  });
});
