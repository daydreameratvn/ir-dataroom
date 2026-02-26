import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TestWrapper, { ensureI18n } from '@/test/wrapper';
import FatimaPanel from './FatimaPanel';

beforeAll(async () => {
  await ensureI18n();
});

function renderPanel(props: { open?: boolean; onClose?: () => void } = {}) {
  const onClose = props.onClose ?? vi.fn();
  return {
    onClose,
    ...render(
      <TestWrapper>
        <FatimaPanel open={props.open ?? true} onClose={onClose} />
      </TestWrapper>
    ),
  };
}

describe('FatimaPanel', () => {
  it('renders nothing when closed', () => {
    renderPanel({ open: false });

    expect(screen.queryByText('Fatima')).not.toBeInTheDocument();
  });

  it('renders header with Fatima name when open', () => {
    renderPanel({ open: true });

    // "Fatima" appears in multiple places (header + welcome message), use heading
    expect(screen.getByRole('heading', { name: 'Fatima' })).toBeInTheDocument();
    expect(screen.getByText('Wise woman of the desert')).toBeInTheDocument();
  });

  it('shows welcome message on first render', () => {
    renderPanel({ open: true });

    // The welcome message references The Alchemist
    expect(screen.getByText(/like the wind that knows every grain of sand/i)).toBeInTheDocument();
  });

  it('shows suggestion chips on initial state', () => {
    renderPanel({ open: true });

    expect(screen.getByText('Show recent claims')).toBeInTheDocument();
    expect(screen.getByText('Any fraud alerts?')).toBeInTheDocument();
    expect(screen.getByText('What can you do?')).toBeInTheDocument();
    expect(screen.getByText('Loss ratio this month')).toBeInTheDocument();
  });

  it('has input field with placeholder', () => {
    renderPanel({ open: true });

    expect(screen.getByPlaceholderText('Ask Fatima anything...')).toBeInTheDocument();
  });

  it('shows disclaimer text', () => {
    renderPanel({ open: true });

    expect(screen.getByText(/Fatima can make mistakes/)).toBeInTheDocument();
  });

  it('sends message on Enter', async () => {
    const user = userEvent.setup();
    renderPanel({ open: true });

    const input = screen.getByPlaceholderText('Ask Fatima anything...');
    await user.type(input, 'Show recent claims{Enter}');

    // User message should appear
    expect(screen.getByText('Show recent claims')).toBeInTheDocument();

    // Input should be cleared
    expect(input).toHaveValue('');
  });

  it('sends message on suggestion chip click', async () => {
    const user = userEvent.setup();
    renderPanel({ open: true });

    await user.click(screen.getByText('Any fraud alerts?'));

    // Streaming should start — header shows "Thinking..."
    expect(screen.getByText('Thinking...')).toBeInTheDocument();
  });

  it('streams response after sending a message', async () => {
    const user = userEvent.setup();
    renderPanel({ open: true });

    const input = screen.getByPlaceholderText('Ask Fatima anything...');
    await user.type(input, 'Show recent claims{Enter}');

    // Wait for the streamed response to include expected content
    await waitFor(() => {
      expect(screen.getByText(/CLM-2024-001/)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('calls onClose when X button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderPanel({ open: true, onClose });

    // The X button — find by the close button (last ghost icon button)
    const buttons = screen.getAllByRole('button');
    const closeButton = buttons.find(
      (btn) => btn.querySelector('.lucide-x') !== null
    );

    // If we can't find by icon, just click the button with no accessible name that's in the header
    // The X button is the last button in the header area
    if (closeButton) {
      await user.click(closeButton);
    } else {
      // Fallback: find buttons in the header and click the last one
      const headerButtons = screen.getAllByRole('button').filter(
        (btn) => !btn.hasAttribute('disabled')
      );
      await user.click(headerButtons[2]!); // New conversation, Expand, Close
    }

    expect(onClose).toHaveBeenCalled();
  });

  it('does not send empty messages', async () => {
    const user = userEvent.setup();
    renderPanel({ open: true });

    const input = screen.getByPlaceholderText('Ask Fatima anything...');

    // Try to submit empty
    await user.type(input, '{Enter}');

    // Should still only see welcome message suggestions
    expect(screen.getByText('Try asking')).toBeInTheDocument();
  });
});
