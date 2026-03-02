import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TestWrapper, { ensureI18n } from '@/test/wrapper';
import AdminPage from './AdminPage';

// Mock @papaya/auth (UserTable uses useAuth from this lib)
vi.mock('@papaya/auth', () => ({
  useAuth: () => ({
    user: {
      id: 'user-001',
      email: 'admin@papaya.asia',
      name: 'Sarah Chen',
      userType: 'insurer',
      userLevel: 'admin',
      tenantId: 'papaya-demo',
    },
    session: { accessToken: 'mock-token' },
    isAuthenticated: true,
    isLoading: false,
  }),
  getAccessToken: () => 'mock-token',
  setAccessToken: vi.fn(),
  clearAccessToken: vi.fn(),
  isTokenValid: () => true,
  onTokenChange: vi.fn(),
  reportError: vi.fn(),
}));

// Mock the API module (used by UserTable)
vi.mock('./api', () => ({
  listUsers: vi.fn().mockResolvedValue({
    data: [],
    total: 0,
    page: 1,
    pageSize: 20,
    hasMore: false,
  }),
  listTenants: vi.fn().mockResolvedValue([]),
  deleteUser: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  setUserImpersonatable: vi.fn(),
}));

// Mock the directory API (used by IdentityProviders)
vi.mock('./directory-api', () => ({
  listProviders: vi.fn().mockResolvedValue([]),
  createProvider: vi.fn(),
  updateProvider: vi.fn(),
  deleteProvider: vi.fn(),
  getGoogleConnectUrl: vi.fn(),
  triggerSync: vi.fn(),
  listSyncLogs: vi.fn(),
}));

// Mock error API (used by ErrorTracker)
vi.mock('./error-api', () => ({
  listErrors: vi.fn().mockResolvedValue({
    data: [],
    total: 0,
    page: 1,
    pageSize: 20,
    hasMore: false,
  }),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  await ensureI18n();
});

describe('AdminPage', () => {
  it('renders page with four tabs', () => {
    render(
      <TestWrapper>
        <AdminPage />
      </TestWrapper>,
    );

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
  });

  it('renders the settings tab trigger', () => {
    render(
      <TestWrapper>
        <AdminPage />
      </TestWrapper>,
    );

    // Tab text may be i18n key or translated value
    const settingsTab = screen.getAllByRole('tab')[1]!;
    expect(settingsTab).toBeDefined();
  });

  it('switches to Settings tab and shows Identity Providers empty state', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <AdminPage />
      </TestWrapper>,
    );

    // Click the second tab (Settings)
    const settingsTab = screen.getAllByRole('tab')[1]!;
    await user.click(settingsTab);

    expect(settingsTab).toHaveAttribute('aria-selected', 'true');

    // IdentityProviders component renders with empty providers
    await waitFor(() => {
      expect(screen.getByText('Identity Providers')).toBeInTheDocument();
    });
  });

  it('shows Connect Google Workspace button in settings empty state', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <AdminPage />
      </TestWrapper>,
    );

    const settingsTab = screen.getAllByRole('tab')[1]!;
    await user.click(settingsTab);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /connect google workspace/i }),
      ).toBeInTheDocument();
    });
  });
});
