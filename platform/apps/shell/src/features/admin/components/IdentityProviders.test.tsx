import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TestWrapper, { ensureI18n } from '@/test/wrapper';
import IdentityProviders from './IdentityProviders';
import type { IdentityProvider } from '../directory-api';

const mockListProviders = vi.fn();
const mockCreateProvider = vi.fn();
const mockUpdateProvider = vi.fn();
const mockDeleteProvider = vi.fn();
const mockGetGoogleConnectUrl = vi.fn();
const mockTriggerSync = vi.fn();

vi.mock('../directory-api', () => ({
  listProviders: (...args: unknown[]) => mockListProviders(...args),
  createProvider: (...args: unknown[]) => mockCreateProvider(...args),
  updateProvider: (...args: unknown[]) => mockUpdateProvider(...args),
  deleteProvider: (...args: unknown[]) => mockDeleteProvider(...args),
  getGoogleConnectUrl: (...args: unknown[]) => mockGetGoogleConnectUrl(...args),
  triggerSync: (...args: unknown[]) => mockTriggerSync(...args),
  listSyncLogs: vi.fn().mockResolvedValue({
    data: [],
    total: 0,
    page: 1,
    pageSize: 20,
    hasMore: false,
  }),
}));

const CONNECTED_PROVIDER: IdentityProvider = {
  id: 'prov-1',
  tenant_id: 'tenant-1',
  provider_type: 'google_workspace',
  display_name: 'Google Workspace',
  domains: ['papaya.asia', 'papaya.com'],
  auto_join_enabled: true,
  auto_join_user_type: 'insurer',
  auto_join_user_level: 'viewer',
  auto_offboard_enabled: false,
  admin_email: 'admin@papaya.asia',
  google_customer_id: 'C12345',
  last_sync_at: new Date(Date.now() - 3600_000).toISOString(),
  last_sync_status: 'success',
  last_sync_error: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-02-28T00:00:00Z',
};

const UNCONNECTED_PROVIDER: IdentityProvider = {
  ...CONNECTED_PROVIDER,
  id: 'prov-2',
  admin_email: null,
  google_customer_id: null,
  last_sync_at: null,
  last_sync_status: null,
  domains: [],
};

beforeEach(async () => {
  vi.clearAllMocks();
  await ensureI18n();
});

describe('IdentityProviders', () => {
  it('shows empty state when no providers exist', async () => {
    mockListProviders.mockResolvedValue([]);

    render(
      <TestWrapper>
        <IdentityProviders />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Identity Providers')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/connect your organization/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /connect google workspace/i }),
    ).toBeInTheDocument();
  });

  it('renders a connected provider card', async () => {
    mockListProviders.mockResolvedValue([CONNECTED_PROVIDER]);

    render(
      <TestWrapper>
        <IdentityProviders />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Google Workspace')).toBeInTheDocument();
    });

    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText(/admin@papaya\.asia/)).toBeInTheDocument();
    expect(screen.getByText('@papaya.asia')).toBeInTheDocument();
    expect(screen.getByText('@papaya.com')).toBeInTheDocument();
  });

  it('shows Sync Now and History buttons for connected provider', async () => {
    mockListProviders.mockResolvedValue([CONNECTED_PROVIDER]);

    render(
      <TestWrapper>
        <IdentityProviders />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sync now/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument();
  });

  it('shows Connect button for unconnected provider', async () => {
    mockListProviders.mockResolvedValue([UNCONNECTED_PROVIDER]);

    render(
      <TestWrapper>
        <IdentityProviders />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Not Connected')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /^connect$/i })).toBeInTheDocument();
  });

  it('shows last sync status badge', async () => {
    mockListProviders.mockResolvedValue([CONNECTED_PROVIDER]);

    render(
      <TestWrapper>
        <IdentityProviders />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('success')).toBeInTheDocument();
    });
  });

  it('shows auto-join type/level selectors when enabled', async () => {
    mockListProviders.mockResolvedValue([CONNECTED_PROVIDER]);

    render(
      <TestWrapper>
        <IdentityProviders />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Domain Auto-Join')).toBeInTheDocument();
    });

    expect(screen.getByText('Auto Offboarding')).toBeInTheDocument();
  });

  it('triggers sync on Sync Now click', async () => {
    mockListProviders.mockResolvedValue([CONNECTED_PROVIDER]);
    mockTriggerSync.mockResolvedValue({
      logId: 'log-1',
      status: 'success',
      counts: {
        usersFetched: 10,
        usersCreated: 2,
        usersUpdated: 0,
        usersDeactivated: 0,
        usersSkipped: 8,
        errorsCount: 0,
      },
    });

    const user = userEvent.setup();

    render(
      <TestWrapper>
        <IdentityProviders />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sync now/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /sync now/i }));

    await waitFor(() => {
      expect(mockTriggerSync).toHaveBeenCalledWith('prov-1');
    });
  });

  it('shows error state when loading fails', async () => {
    mockListProviders.mockRejectedValue(new Error('Network error'));

    render(
      <TestWrapper>
        <IdentityProviders />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/failed to load identity providers/i)).toBeInTheDocument();
    });
  });
});
