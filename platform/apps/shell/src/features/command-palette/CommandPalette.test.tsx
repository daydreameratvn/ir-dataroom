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

    expect(screen.queryByPlaceholderText('Where do you want to go?')).not.toBeInTheDocument();

    openPalette();

    expect(screen.getByPlaceholderText('Where do you want to go?')).toBeInTheDocument();
  });

  it('shows AI Assistant, Quick Actions, and Go to sections', () => {
    renderPalette();
    openPalette();

    expect(screen.getByText('AI Assistant')).toBeInTheDocument();
    expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    expect(screen.getByText('Go to')).toBeInTheDocument();
  });

  it('shows Ask Fatima entry with description', () => {
    renderPalette();
    openPalette();

    expect(screen.getByText('Ask Fatima')).toBeInTheDocument();
    expect(screen.getByText('Your AI insurance assistant')).toBeInTheDocument();
  });

  it('shows quick action items', () => {
    renderPalette();
    openPalette();

    expect(screen.getByText('New Claim')).toBeInTheDocument();
    expect(screen.getByText('New Policy')).toBeInTheDocument();
    expect(screen.getByText('New Underwriting Application')).toBeInTheDocument();
  });

  it('shows navigation items', () => {
    renderPalette();
    openPalette();

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Claims Intake')).toBeInTheDocument();
    expect(screen.getByText('Browse Policies')).toBeInTheDocument();
    expect(screen.getByText('FWA Alerts')).toBeInTheDocument();
  });

  it('filters results when typing', async () => {
    const user = userEvent.setup();
    renderPalette();
    openPalette();

    const input = screen.getByPlaceholderText('Where do you want to go?');
    await user.type(input, 'fraud');

    // FWA items should remain visible (they have 'fraud' in keywords)
    expect(screen.getByText('FWA Alerts')).toBeInTheDocument();

    // Unrelated items should be filtered out
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('Browse Policies')).not.toBeInTheDocument();
  });

  it('shows empty state with Fatima fallback when no results', async () => {
    const user = userEvent.setup();
    renderPalette();
    openPalette();

    const input = screen.getByPlaceholderText('Where do you want to go?');
    await user.type(input, 'xyznonexistent');

    expect(screen.getByText('No results found.')).toBeInTheDocument();
    expect(screen.getByText('Ask Fatima instead')).toBeInTheDocument();
  });

  it('calls onOpenFatima when Ask Fatima is selected', async () => {
    const user = userEvent.setup();
    const { onOpenFatima } = renderPalette();
    openPalette();

    const fatimaItem = screen.getByText('Ask Fatima');
    await user.click(fatimaItem);

    expect(onOpenFatima).toHaveBeenCalledOnce();
  });

  it('calls onOpenFatima from empty state fallback', async () => {
    const user = userEvent.setup();
    const { onOpenFatima } = renderPalette();
    openPalette();

    const input = screen.getByPlaceholderText('Where do you want to go?');
    await user.type(input, 'xyznonexistent');

    const fallback = screen.getByText('Ask Fatima instead');
    await user.click(fallback);

    expect(onOpenFatima).toHaveBeenCalledOnce();
  });

  it('closes when pressing Meta+K again', () => {
    renderPalette();

    openPalette();
    expect(screen.getByPlaceholderText('Where do you want to go?')).toBeInTheDocument();

    openPalette();
    expect(screen.queryByPlaceholderText('Where do you want to go?')).not.toBeInTheDocument();
  });
});
