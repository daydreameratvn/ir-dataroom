import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DocumentUploadDialog from './DocumentUploadDialog';

vi.mock('../api', () => ({
  createDocument: vi.fn().mockResolvedValue({ id: 'doc-1' }),
  uploadDocumentFile: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DocumentUploadDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    roundId: 'round-1',
    onCreated: vi.fn(),
  };

  it('renders the dialog title', () => {
    render(<DocumentUploadDialog {...defaultProps} />);

    expect(screen.getByRole('heading', { name: 'Add Document' })).toBeInTheDocument();
  });

  it('renders name input field', () => {
    render(<DocumentUploadDialog {...defaultProps} />);

    expect(
      screen.getByPlaceholderText('e.g. Q4 2025 Financial Statements'),
    ).toBeInTheDocument();
  });

  it('renders Add Document and Cancel buttons', () => {
    render(<DocumentUploadDialog {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Add Document' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('shows error when submitting without name', async () => {
    const user = userEvent.setup();
    render(<DocumentUploadDialog {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: 'Add Document' }));

    expect(screen.getByText('Document name is required')).toBeInTheDocument();
  });

  it('calls createDocument and onCreated on successful submit', async () => {
    const { createDocument } = await import('../api');
    const user = userEvent.setup();
    render(<DocumentUploadDialog {...defaultProps} />);

    await user.type(
      screen.getByPlaceholderText('e.g. Q4 2025 Financial Statements'),
      'Revenue Report',
    );
    await user.click(screen.getByRole('button', { name: 'Add Document' }));

    await waitFor(() => {
      expect(createDocument).toHaveBeenCalledWith('round-1', {
        name: 'Revenue Report',
        category: 'other',
        watermarkEnabled: true,
      });
    });

    expect(defaultProps.onCreated).toHaveBeenCalled();
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders enable watermark toggle label', () => {
    render(<DocumentUploadDialog {...defaultProps} />);

    expect(screen.getByText('Enable watermark')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    render(<DocumentUploadDialog {...defaultProps} open={false} />);

    expect(screen.queryByText('Add Document')).not.toBeInTheDocument();
  });
});
