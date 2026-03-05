import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import TestWrapper, { ensureI18n } from '@/test/wrapper';
import DashboardView from './DashboardView';

vi.mock('../hooks/useDashboardStats', () => ({
  useDashboardStats: vi.fn(),
}));

import { useDashboardStats } from '../hooks/useDashboardStats';

const mockedUseDashboardStats = vi.mocked(useDashboardStats);

beforeAll(async () => { await ensureI18n(); });

function renderWithRouter() {
  return render(
    <TestWrapper>
      <DashboardView />
    </TestWrapper>,
  );
}

describe('DashboardView', () => {
  it('renders loading state', () => {
    mockedUseDashboardStats.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useDashboardStats>);

    renderWithRouter();

    // StatCards show dash when loading
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBe(4);

    // Table shows loading text
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders dashboard stats when data is loaded', () => {
    mockedUseDashboardStats.mockReturnValue({
      data: {
        totalClaims: 42,
        processing: 8,
        awaitingApproval: 5,
        approved: 29,
        recentClaims: [],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useDashboardStats>);

    renderWithRouter();

    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('29')).toBeInTheDocument();

    // Labels
    expect(screen.getByText('Total Claims')).toBeInTheDocument();
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.getByText('Awaiting Approval')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('renders recent claims table with data', () => {
    mockedUseDashboardStats.mockReturnValue({
      data: {
        totalClaims: 1,
        processing: 0,
        awaitingApproval: 0,
        approved: 0,
        recentClaims: [
          {
            id: 'claim-1',
            claimNumber: 'CLM-001',
            status: 'SUBMITTED',
            type: 'INPATIENT',
            insuredName: 'John Doe',
            totalRequestedAmount: 10000,
            currency: 'THB',
            createdAt: '2026-01-15T00:00:00Z',
          },
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useDashboardStats>);

    renderWithRouter();

    expect(screen.getByText('Recent Claims')).toBeInTheDocument();
    expect(screen.getByText('CLM-001')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.getByText('Inpatient')).toBeInTheDocument();
  });

  it('renders empty recent claims message', () => {
    mockedUseDashboardStats.mockReturnValue({
      data: {
        totalClaims: 0,
        processing: 0,
        awaitingApproval: 0,
        approved: 0,
        recentClaims: [],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useDashboardStats>);

    renderWithRouter();

    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('renders page header with title', () => {
    mockedUseDashboardStats.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useDashboardStats>);

    renderWithRouter();

    expect(screen.getByText('Portal')).toBeInTheDocument();
    expect(screen.getByText('Claims processing portal')).toBeInTheDocument();
  });
});
