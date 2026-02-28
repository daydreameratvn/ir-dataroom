import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvestorInviteDialog from './InvestorInviteDialog';

vi.mock('../api', () => ({
  addInvestorToRound: vi.fn().mockResolvedValue({ id: 'ir-1', investorId: 'inv-1' }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('InvestorInviteDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    roundId: 'round-1',
    onAdded: vi.fn(),
  };

  it('renders the dialog title', () => {
    render(<InvestorInviteDialog {...defaultProps} />);

    expect(screen.getByText('Add Investor to Round')).toBeInTheDocument();
  });

  it('renders email and name input fields', () => {
    render(<InvestorInviteDialog {...defaultProps} />);

    expect(screen.getByPlaceholderText('investor@firm.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Full name')).toBeInTheDocument();
  });

  it('renders optional firm and title fields', () => {
    render(<InvestorInviteDialog {...defaultProps} />);

    expect(screen.getByPlaceholderText('Investment firm name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Managing Partner')).toBeInTheDocument();
  });

  it('renders Add Investor and Cancel buttons', () => {
    render(<InvestorInviteDialog {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Add Investor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('shows error when submitting without email', async () => {
    const user = userEvent.setup();
    render(<InvestorInviteDialog {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: 'Add Investor' }));

    expect(screen.getByText('Email is required')).toBeInTheDocument();
  });

  it('shows error when submitting without name', async () => {
    const user = userEvent.setup();
    render(<InvestorInviteDialog {...defaultProps} />);

    await user.type(screen.getByPlaceholderText('investor@firm.com'), 'john@example.com');
    await user.click(screen.getByRole('button', { name: 'Add Investor' }));

    expect(screen.getByText('Name is required')).toBeInTheDocument();
  });

  it('calls addInvestorToRound and onAdded on successful submit', async () => {
    const { addInvestorToRound } = await import('../api');
    const user = userEvent.setup();
    render(<InvestorInviteDialog {...defaultProps} />);

    await user.type(screen.getByPlaceholderText('investor@firm.com'), 'john@example.com');
    await user.type(screen.getByPlaceholderText('Full name'), 'John Doe');
    await user.type(screen.getByPlaceholderText('Investment firm name'), 'Acme Capital');
    await user.click(screen.getByRole('button', { name: 'Add Investor' }));

    await waitFor(() => {
      expect(addInvestorToRound).toHaveBeenCalledWith('round-1', {
        email: 'john@example.com',
        name: 'John Doe',
        firm: 'Acme Capital',
      });
    });

    expect(defaultProps.onAdded).toHaveBeenCalled();
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders skip NDA checkbox', () => {
    render(<InvestorInviteDialog {...defaultProps} />);

    expect(screen.getByText('Skip NDA requirement for this investor')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    render(<InvestorInviteDialog {...defaultProps} open={false} />);

    expect(screen.queryByText('Add Investor to Round')).not.toBeInTheDocument();
  });
});
