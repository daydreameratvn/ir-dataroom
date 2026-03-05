import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import TestWrapper, { ensureI18n } from '@/test/wrapper';
import ClaimsList from './ClaimsList';

vi.mock('../hooks/usePortalClaims', () => ({
  usePortalClaims: vi.fn(),
}));

import { usePortalClaims } from '../hooks/usePortalClaims';

const mockedUsePortalClaims = vi.mocked(usePortalClaims);

beforeAll(async () => { await ensureI18n(); });

function renderWithRouter() {
  return render(
    <TestWrapper>
      <ClaimsList />
    </TestWrapper>,
  );
}

describe('ClaimsList', () => {
  it('renders loading state', () => {
    mockedUsePortalClaims.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof usePortalClaims>);

    renderWithRouter();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders claims table with data', () => {
    mockedUsePortalClaims.mockReturnValue({
      data: {
        data: [
          {
            id: 'claim-1',
            claimNumber: 'CLM-100',
            status: 'WAITING_FOR_APPROVAL',
            type: 'OUTPATIENT',
            insuredName: 'Jane Smith',
            totalRequestedAmount: 5000,
            currency: 'THB',
            createdAt: '2026-02-20T00:00:00Z',
          },
          {
            id: 'claim-2',
            claimNumber: 'CLM-101',
            status: 'SUCCESS',
            type: 'DENTAL',
            insuredName: 'Bob Lee',
            totalRequestedAmount: 2500,
            currency: 'USD',
            createdAt: '2026-02-21T00:00:00Z',
          },
        ],
        total: 2,
        page: 1,
        pageSize: 30,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof usePortalClaims>);

    renderWithRouter();

    // Table headers
    expect(screen.getByText('Claim Number')).toBeInTheDocument();
    expect(screen.getByText('Insured Name')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();

    // First claim
    expect(screen.getByText('CLM-100')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Awaiting Approval')).toBeInTheDocument();
    expect(screen.getByText('Outpatient')).toBeInTheDocument();

    // Second claim
    expect(screen.getByText('CLM-101')).toBeInTheDocument();
    expect(screen.getByText('Bob Lee')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('Dental')).toBeInTheDocument();

    // Total in subtitle
    expect(screen.getByText('2 total claims')).toBeInTheDocument();
  });

  it('renders empty state when no claims', () => {
    mockedUsePortalClaims.mockReturnValue({
      data: {
        data: [],
        total: 0,
        page: 1,
        pageSize: 30,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof usePortalClaims>);

    renderWithRouter();

    expect(screen.getByText('No claims found')).toBeInTheDocument();
    expect(screen.getByText('No claims have been submitted yet.')).toBeInTheDocument();
  });

  it('has a search input', () => {
    mockedUsePortalClaims.mockReturnValue({
      data: {
        data: [],
        total: 0,
        page: 1,
        pageSize: 30,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof usePortalClaims>);

    renderWithRouter();

    expect(screen.getByPlaceholderText('Search claim number...')).toBeInTheDocument();
  });
});
