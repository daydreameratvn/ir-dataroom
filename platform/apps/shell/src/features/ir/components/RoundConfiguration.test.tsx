import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RoundConfiguration from './RoundConfiguration';
import type { Round } from '../types';

vi.mock('../api', () => ({
  updateRound: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const mockRound: Round = {
  id: 'round-1',
  tenantId: 'tenant-1',
  name: 'Series A',
  slug: 'series-a',
  status: 'active',
  description: null,
  configuration: {
    categories: ['financials', 'strategy', 'legal'],
    watermarkEnabled: true,
    ndaRequired: true,
    allowDownload: false,
    expiresAt: null,
    customBranding: { logoUrl: null, primaryColor: null },
  },
  targetRaise: 10000000,
  currency: 'USD',
  startedAt: '2026-01-15',
  closedAt: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-15',
};

describe('RoundConfiguration', () => {
  it('renders Document Categories heading', () => {
    render(<RoundConfiguration round={mockRound} onSaved={vi.fn()} />);

    expect(screen.getByText('Document Categories')).toBeInTheDocument();
  });

  it('renders Access Controls heading', () => {
    render(<RoundConfiguration round={mockRound} onSaved={vi.fn()} />);

    expect(screen.getByText('Access Controls')).toBeInTheDocument();
  });

  it('renders all default category buttons', () => {
    render(<RoundConfiguration round={mockRound} onSaved={vi.fn()} />);

    expect(screen.getByText('Financials')).toBeInTheDocument();
    expect(screen.getByText('Strategy')).toBeInTheDocument();
    expect(screen.getByText('Product')).toBeInTheDocument();
    expect(screen.getByText('Legal')).toBeInTheDocument();
    expect(screen.getByText('Team')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  it('renders toggle labels', () => {
    render(<RoundConfiguration round={mockRound} onSaved={vi.fn()} />);

    expect(screen.getByText('Watermark Documents')).toBeInTheDocument();
    expect(screen.getByText('Require NDA')).toBeInTheDocument();
    expect(screen.getByText('Allow Downloads')).toBeInTheDocument();
  });

  it('renders Save Configuration button', () => {
    render(<RoundConfiguration round={mockRound} onSaved={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Save Configuration' })).toBeInTheDocument();
  });

  it('calls updateRound and onSaved on save', async () => {
    const { updateRound } = await import('../api');
    const onSaved = vi.fn();
    const user = userEvent.setup();

    render(<RoundConfiguration round={mockRound} onSaved={onSaved} />);

    await user.click(screen.getByRole('button', { name: 'Save Configuration' }));

    await waitFor(() => {
      expect(updateRound).toHaveBeenCalledWith('round-1', expect.any(Object));
    });

    expect(onSaved).toHaveBeenCalled();
  });

  it('shows success message after saving', async () => {
    const user = userEvent.setup();

    render(<RoundConfiguration round={mockRound} onSaved={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Save Configuration' }));

    await waitFor(() => {
      expect(screen.getByText('Configuration saved successfully.')).toBeInTheDocument();
    });
  });

  it('shows error message when save fails', async () => {
    const { updateRound } = await import('../api');
    (updateRound as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));
    const user = userEvent.setup();

    render(<RoundConfiguration round={mockRound} onSaved={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Save Configuration' }));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });
});
