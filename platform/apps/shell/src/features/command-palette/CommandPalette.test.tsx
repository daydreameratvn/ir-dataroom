import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TestWrapper, { ensureI18n } from '@/test/wrapper';
import CommandPalette from './CommandPalette';

beforeAll(async () => {
  await ensureI18n();
});

function renderPalette(onOpenFatima = vi.fn()) {
  return {
    onOpenFatima,
    ...render(
      <TestWrapper>
        <CommandPalette onOpenFatima={onOpenFatima} />
      </TestWrapper>
    ),
  };
}

function openPalette() {
  fireEvent.keyDown(document, { key: 'k', metaKey: true });
}

describe('CommandPalette', () => {
  it('opens with Meta+K', () => {
    renderPalette();

    expect(screen.queryByPlaceholderText('Type a command or ask Fatima...')).not.toBeInTheDocument();

    openPalette();

    expect(screen.getByPlaceholderText('Type a command or ask Fatima...')).toBeInTheDocument();
  });

  it('shows AI Assistant, Quick Actions, and Go to sections', () => {
    renderPalette();
    openPalette();

    expect(screen.getByText('AI Assistant')).toBeInTheDocument();
    expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    expect(screen.getByText('Go to')).toBeInTheDocument();
  });

  it('shows Open Fatima entry with description', () => {
    renderPalette();
    openPalette();

    expect(screen.getByText('Open Fatima')).toBeInTheDocument();
    expect(screen.getByText('Wise woman of the desert')).toBeInTheDocument();
  });

  it('shows quick action items', () => {
    renderPalette();
    openPalette();

    expect(screen.getByText('New Claim')).toBeInTheDocument();
    expect(screen.getByText('New Policy')).toBeInTheDocument();
    expect(screen.getByText('New Application')).toBeInTheDocument();
  });

  it('shows navigation items', () => {
    renderPalette();
    openPalette();

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Claims Intake')).toBeInTheDocument();
    expect(screen.getByText('Browse Policies')).toBeInTheDocument();
    expect(screen.getByText('Alerts')).toBeInTheDocument();
  });

  it('filters results when typing', async () => {
    const user = userEvent.setup();
    renderPalette();
    openPalette();

    const input = screen.getByPlaceholderText('Type a command or ask Fatima...');
    await user.type(input, 'fraud');

    // FWA items should remain visible (they have 'fraud' in keywords)
    expect(screen.getByText('Alerts')).toBeInTheDocument();

    // Unrelated items should be filtered out
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('Browse Policies')).not.toBeInTheDocument();
  });

  it('shows empty state with Fatima fallback when no results', async () => {
    const user = userEvent.setup();
    renderPalette();
    openPalette();

    const input = screen.getByPlaceholderText('Type a command or ask Fatima...');
    await user.type(input, 'xyznonexistent');

    expect(screen.getByText('No results found.')).toBeInTheDocument();
    expect(screen.getByText(/Ask Fatima/)).toBeInTheDocument();
  });

  it('calls onOpenFatima when Open Fatima is selected', async () => {
    const user = userEvent.setup();
    const { onOpenFatima } = renderPalette();
    openPalette();

    const fatimaItem = screen.getByText('Open Fatima');
    await user.click(fatimaItem);

    expect(onOpenFatima).toHaveBeenCalledOnce();
  });

  it('enters inline Fatima mode from empty state fallback', async () => {
    const user = userEvent.setup();
    renderPalette();
    openPalette();

    const input = screen.getByPlaceholderText('Type a command or ask Fatima...');
    await user.type(input, 'xyznonexistent');

    const fallback = screen.getByText(/Ask Fatima/);
    await user.click(fallback);

    // Should switch to Fatima inline mode showing the query
    expect(screen.getByText('xyznonexistent')).toBeInTheDocument();
  });

  it('closes when pressing Meta+K again', () => {
    renderPalette();

    openPalette();
    expect(screen.getByPlaceholderText('Type a command or ask Fatima...')).toBeInTheDocument();

    openPalette();
    expect(screen.queryByPlaceholderText('Type a command or ask Fatima...')).not.toBeInTheDocument();
  });
});
