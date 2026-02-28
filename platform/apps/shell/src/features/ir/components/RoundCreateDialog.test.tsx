import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RoundCreateDialog from './RoundCreateDialog';

vi.mock('../api', () => ({
  createRound: vi.fn().mockResolvedValue({ id: 'round-1' }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RoundCreateDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onCreated: vi.fn(),
  };

  it('renders the dialog with title', () => {
    render(<RoundCreateDialog {...defaultProps} />);

    expect(screen.getByRole('heading', { name: 'Create Round' })).toBeInTheDocument();
  });

  it('renders name and slug input fields', () => {
    render(<RoundCreateDialog {...defaultProps} />);

    expect(screen.getByPlaceholderText('e.g. Series A')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. series-a')).toBeInTheDocument();
  });

  it('auto-generates slug from name', async () => {
    const user = userEvent.setup();
    render(<RoundCreateDialog {...defaultProps} />);

    const nameInput = screen.getByPlaceholderText('e.g. Series A');
    await user.type(nameInput, 'Series A Round');

    const slugInput = screen.getByPlaceholderText('e.g. series-a') as HTMLInputElement;
    expect(slugInput.value).toBe('series-a-round');
  });

  it('renders Create Round and Cancel buttons', () => {
    render(<RoundCreateDialog {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Create Round' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('calls onOpenChange when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<RoundCreateDialog {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows error when submitting without name', async () => {
    const user = userEvent.setup();
    render(<RoundCreateDialog {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: 'Create Round' }));

    expect(screen.getByText('Name is required')).toBeInTheDocument();
  });

  it('calls createRound and onCreated on successful submit', async () => {
    const { createRound } = await import('../api');
    const user = userEvent.setup();
    render(<RoundCreateDialog {...defaultProps} />);

    await user.type(screen.getByPlaceholderText('e.g. Series A'), 'Series B');
    await user.click(screen.getByRole('button', { name: 'Create Round' }));

    await waitFor(() => {
      expect(createRound).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Series B',
          slug: 'series-b',
        }),
      );
    });

    expect(defaultProps.onCreated).toHaveBeenCalled();
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not render when open is false', () => {
    render(<RoundCreateDialog {...defaultProps} open={false} />);

    expect(screen.queryByText('Create Round')).not.toBeInTheDocument();
  });
});
