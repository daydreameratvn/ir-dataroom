import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TestWrapper, { ensureI18n } from '@/test/wrapper';
import IRPage from './IRPage';

// Mock the API module
vi.mock('./api', () => ({
  getStats: vi.fn().mockResolvedValue({
    totalRounds: 3,
    activeRounds: 1,
    totalInvestors: 15,
    totalDocuments: 42,
    totalViews: 256,
    uniqueViewers: 8,
  }),
  listRounds: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  getRound: vi.fn(),
  listAllInvestors: vi.fn().mockResolvedValue([]),
  createRound: vi.fn(),
  getRecentActivity: vi.fn().mockResolvedValue([]),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  await ensureI18n();
});

describe('IRPage', () => {
  it('renders the page header', () => {
    render(
      <TestWrapper>
        <IRPage />
      </TestWrapper>,
    );

    expect(screen.getByText('Investor Relations')).toBeInTheDocument();
    expect(
      screen.getByText('Manage fundraising rounds, data rooms, and investor access'),
    ).toBeInTheDocument();
  });

  it('renders stat cards', async () => {
    render(
      <TestWrapper>
        <IRPage />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Total Rounds')).toBeInTheDocument();
    });

    expect(screen.getByText('Active Rounds')).toBeInTheDocument();
    expect(screen.getByText('Total Investors')).toBeInTheDocument();
    expect(screen.getByText('Total Documents')).toBeInTheDocument();
  });

  it('renders stat card values after loading', async () => {
    render(
      <TestWrapper>
        <IRPage />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders the Rounds and All Investors tabs', () => {
    render(
      <TestWrapper>
        <IRPage />
      </TestWrapper>,
    );

    expect(screen.getByRole('tab', { name: 'Rounds' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All Investors' })).toBeInTheDocument();
  });

  it('defaults to Rounds tab', () => {
    render(
      <TestWrapper>
        <IRPage />
      </TestWrapper>,
    );

    const roundsTab = screen.getByRole('tab', { name: 'Rounds' });
    expect(roundsTab).toHaveAttribute('aria-selected', 'true');
  });

  it('shows New Round button on Rounds tab', async () => {
    render(
      <TestWrapper>
        <IRPage />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new round/i })).toBeInTheDocument();
    });
  });

  it('switches to All Investors tab', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <IRPage />
      </TestWrapper>,
    );

    await user.click(screen.getByRole('tab', { name: 'All Investors' }));

    expect(screen.getByRole('tab', { name: 'All Investors' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('shows search input on All Investors tab', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <IRPage />
      </TestWrapper>,
    );

    await user.click(screen.getByRole('tab', { name: 'All Investors' }));

    expect(
      screen.getByPlaceholderText('Search by name, email, or firm...'),
    ).toBeInTheDocument();
  });
});
