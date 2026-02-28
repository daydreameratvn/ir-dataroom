import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TestWrapper, { ensureI18n } from '@/test/wrapper';
import StatusPageContent from './StatusPageContent';
import type { StatusResponse } from './types';

// ── Mock data ──

const mockStatusResponse: StatusResponse = {
  services: [
    { name: 'Platform', status: 'operational', latencyMs: 42 },
    { name: 'Authentication', status: 'operational', latencyMs: 0 },
    { name: 'API Gateway', status: 'operational', latencyMs: 150 },
    { name: 'AI Agents', status: 'degraded', latencyMs: 3200 },
    { name: 'Database', status: 'operational', latencyMs: 5 },
  ],
  incidents: [
    {
      id: 'inc-1',
      title: 'Elevated API latency',
      description: 'Some API requests are taking longer than usual.',
      severity: 'major',
      status: 'investigating',
      affectedServices: ['API Gateway'],
      startedAt: '2026-02-28T10:00:00Z',
      resolvedAt: null,
      createdAt: '2026-02-28T10:00:00Z',
      createdBy: null,
      updatedAt: '2026-02-28T10:00:00Z',
    },
    {
      id: 'inc-2',
      title: 'Database maintenance completed',
      description: null,
      severity: 'minor',
      status: 'resolved',
      affectedServices: ['Database'],
      startedAt: '2026-02-27T08:00:00Z',
      resolvedAt: '2026-02-27T10:00:00Z',
      createdAt: '2026-02-27T08:00:00Z',
      createdBy: null,
      updatedAt: '2026-02-27T10:00:00Z',
    },
  ],
  uptimeHistory: [
    {
      date: '2026-02-28',
      services: [
        { name: 'Platform', status: 'operational' },
        { name: 'API Gateway', status: 'degraded' },
      ],
    },
  ],
  overrides: [],
  checkedAt: '2026-02-28T12:00:00Z',
};

// ── Setup ──

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.clearAllMocks();
  await ensureI18n();

  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockStatusResponse),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('StatusPageContent', () => {
  it('shows loading spinner initially', () => {
    // Delay the fetch so we see the spinner
    fetchMock.mockReturnValue(new Promise(() => {}));

    render(
      <TestWrapper>
        <StatusPageContent />
      </TestWrapper>,
    );

    expect(document.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders overall status banner after loading', async () => {
    render(
      <TestWrapper>
        <StatusPageContent />
      </TestWrapper>,
    );

    await waitFor(() => {
      // "Partial System Degradation" because AI Agents is degraded
      expect(screen.getByText('Partial System Degradation')).toBeInTheDocument();
    });
  });

  it('renders all 5 services', async () => {
    render(
      <TestWrapper>
        <StatusPageContent />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Platform')).toBeInTheDocument();
    });

    expect(screen.getByText('Authentication')).toBeInTheDocument();
    // Some service names also appear as affected service badges on incidents
    expect(screen.getAllByText('API Gateway').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('AI Agents')).toBeInTheDocument();
    expect(screen.getAllByText('Database').length).toBeGreaterThanOrEqual(1);
  });

  it('shows service descriptions', async () => {
    render(
      <TestWrapper>
        <StatusPageContent />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Web application and user interface')).toBeInTheDocument();
    });

    expect(screen.getByText('Login, SSO, and session management')).toBeInTheDocument();
    expect(screen.getByText('GraphQL and REST API endpoints')).toBeInTheDocument();
  });

  it('shows latency for services with non-zero latency', async () => {
    render(
      <TestWrapper>
        <StatusPageContent />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('42ms')).toBeInTheDocument();
    });

    expect(screen.getByText('150ms')).toBeInTheDocument();
    expect(screen.getByText('3200ms')).toBeInTheDocument();
  });

  it('renders incidents section', async () => {
    render(
      <TestWrapper>
        <StatusPageContent />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Elevated API latency')).toBeInTheDocument();
    });

    expect(screen.getByText('Database maintenance completed')).toBeInTheDocument();
  });

  it('shows severity badges on incidents', async () => {
    render(
      <TestWrapper>
        <StatusPageContent />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Major')).toBeInTheDocument();
    });

    expect(screen.getByText('Minor')).toBeInTheDocument();
  });

  it('shows affected services on incidents', async () => {
    render(
      <TestWrapper>
        <StatusPageContent />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('API Gateway', { selector: '.text-\\[10px\\]' }) || screen.getAllByText('API Gateway').length > 1).toBeTruthy();
    });
  });

  it('shows incident status labels', async () => {
    render(
      <TestWrapper>
        <StatusPageContent />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('investigating')).toBeInTheDocument();
    });

    expect(screen.getByText('resolved')).toBeInTheDocument();
  });

  it('shows "no incidents" when incidents array is empty', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ...mockStatusResponse, incidents: [] }),
    });

    render(
      <TestWrapper>
        <StatusPageContent />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('No recent incidents')).toBeInTheDocument();
    });
  });

  it('shows active incident count in banner', async () => {
    render(
      <TestWrapper>
        <StatusPageContent />
      </TestWrapper>,
    );

    await waitFor(() => {
      // 1 active incident (investigating), 1 resolved
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });

  it('shows error state when fetch fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
    });

    render(
      <TestWrapper>
        <StatusPageContent />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Unable to check system status')).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
    });

    render(
      <TestWrapper>
        <StatusPageContent />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  it('shows "All Systems Operational" when all services are operational', async () => {
    const allOperational = {
      ...mockStatusResponse,
      services: mockStatusResponse.services.map((s) => ({ ...s, status: 'operational' as const })),
    };

    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(allOperational),
    });

    render(
      <TestWrapper>
        <StatusPageContent />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('All Systems Operational')).toBeInTheDocument();
    });
  });

  it('shows "Major System Outage" when a service has outage', async () => {
    const withOutage = {
      ...mockStatusResponse,
      services: [
        ...mockStatusResponse.services.slice(0, 4),
        { name: 'Database', status: 'outage' as const, latencyMs: null, message: 'Connection refused' },
      ],
    };

    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(withOutage),
    });

    render(
      <TestWrapper>
        <StatusPageContent />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Major System Outage')).toBeInTheDocument();
    });
  });

  it('shows override badge when service has an active override', async () => {
    const withOverride = {
      ...mockStatusResponse,
      overrides: [
        {
          id: 'ovr-1',
          serviceName: 'Database',
          status: 'maintenance',
          reason: 'Scheduled maintenance',
          startsAt: '2026-02-28T00:00:00Z',
          endsAt: null,
          createdAt: '2026-02-28T00:00:00Z',
          createdBy: null,
        },
      ],
    };

    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(withOverride),
    });

    render(
      <TestWrapper>
        <StatusPageContent />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Override')).toBeInTheDocument();
    });
  });

  it('shows footer text', async () => {
    render(
      <TestWrapper>
        <StatusPageContent />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Updated every 60 seconds/)).toBeInTheDocument();
    });
  });

  it('expands incident description on click', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <StatusPageContent />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Elevated API latency')).toBeInTheDocument();
    });

    // Description should not be visible initially
    expect(screen.queryByText('Some API requests are taking longer than usual.')).not.toBeInTheDocument();

    // Click to expand
    await user.click(screen.getByText('Elevated API latency'));

    expect(screen.getByText('Some API requests are taking longer than usual.')).toBeInTheDocument();
  });

  it('fetches from /auth/status endpoint', async () => {
    render(
      <TestWrapper>
        <StatusPageContent />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/auth/status');
    });
  });
});
