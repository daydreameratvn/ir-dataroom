import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TestWrapper, { ensureI18n } from '@/test/wrapper';
import SyncHistory from './SyncHistory';

const mockListSyncLogs = vi.fn();

vi.mock('../directory-api', () => ({
  listProviders: vi.fn().mockResolvedValue([]),
  listSyncLogs: (...args: unknown[]) => mockListSyncLogs(...args),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  await ensureI18n();
});

describe('SyncHistory', () => {
  const onClose = vi.fn();

  it('renders the dialog with title', async () => {
    mockListSyncLogs.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
      hasMore: false,
    });

    render(
      <TestWrapper>
        <SyncHistory providerId="prov-1" onClose={onClose} />
      </TestWrapper>,
    );

    expect(screen.getByText('Sync History')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  it('shows empty message when no logs exist', async () => {
    mockListSyncLogs.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
      hasMore: false,
    });

    render(
      <TestWrapper>
        <SyncHistory providerId="prov-1" onClose={onClose} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('No sync history yet')).toBeInTheDocument();
    });
  });

  it('renders sync log entries', async () => {
    mockListSyncLogs.mockResolvedValue({
      data: [
        {
          id: 'log-1',
          trigger_type: 'manual',
          triggered_by: 'user-1',
          status: 'success',
          users_fetched: 50,
          users_created: 5,
          users_updated: 3,
          users_deactivated: 1,
          users_skipped: 41,
          errors_count: 0,
          started_at: '2026-02-28T10:00:00Z',
          completed_at: '2026-02-28T10:00:05Z',
          duration_ms: 5000,
          error_message: null,
          error_details: null,
        },
        {
          id: 'log-2',
          trigger_type: 'scheduled',
          triggered_by: null,
          status: 'failed',
          users_fetched: 0,
          users_created: 0,
          users_updated: 0,
          users_deactivated: 0,
          users_skipped: 0,
          errors_count: 1,
          started_at: '2026-02-28T09:00:00Z',
          completed_at: '2026-02-28T09:00:01Z',
          duration_ms: 1000,
          error_message: 'Token expired',
          error_details: null,
        },
      ],
      total: 2,
      page: 1,
      pageSize: 20,
      hasMore: false,
    });

    render(
      <TestWrapper>
        <SyncHistory providerId="prov-1" onClose={onClose} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Manual')).toBeInTheDocument();
    });

    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('success')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(screen.getByText('+5 created, 3 updated, -1 removed')).toBeInTheDocument();
    expect(screen.getByText('5.0s')).toBeInTheDocument();
    expect(screen.getByText('1.0s')).toBeInTheDocument();
  });

  it('calls onClose when Close button is clicked', async () => {
    mockListSyncLogs.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
      hasMore: false,
    });

    const user = userEvent.setup();

    render(
      <TestWrapper>
        <SyncHistory providerId="prov-1" onClose={onClose} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
