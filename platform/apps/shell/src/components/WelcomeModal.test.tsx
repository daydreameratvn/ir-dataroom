import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TestWrapper, { ensureI18n } from '@/test/wrapper';
import WelcomeModal from './WelcomeModal';

beforeEach(async () => {
  await ensureI18n();
});

describe('WelcomeModal', () => {
  it('renders the welcome screen when open', () => {
    render(
      <TestWrapper>
        <WelcomeModal open={true} onComplete={() => {}} />
      </TestWrapper>,
    );

    // Check for the main heading - contains "Welcome to" and "Oasis"
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <TestWrapper>
        <WelcomeModal open={false} onComplete={() => {}} />
      </TestWrapper>,
    );

    expect(screen.queryByText(/welcome to oasis/i)).not.toBeInTheDocument();
  });

  it('introduces Fatima as the narrator', () => {
    render(
      <TestWrapper>
        <WelcomeModal open={true} onComplete={() => {}} />
      </TestWrapper>,
    );

    // Check for the Fatima heading
    expect(screen.getByRole('heading', { name: /fatima/i })).toBeInTheDocument();
    // Check for the wise woman description
    expect(screen.getByText(/wise woman of the desert/i)).toBeInTheDocument();
  });

  it('shows a continue button', () => {
    render(
      <TestWrapper>
        <WelcomeModal open={true} onComplete={() => {}} />
      </TestWrapper>,
    );

    expect(screen.getByRole('button', { name: /enter oasis|get started|continue/i })).toBeInTheDocument();
  });

  it('calls onComplete when user finishes onboarding', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();

    render(
      <TestWrapper>
        <WelcomeModal open={true} onComplete={onComplete} />
      </TestWrapper>,
    );

    // Step 1: Click Continue to go to next step
    const continueButton = screen.getByRole('button', { name: /continue/i });
    await user.click(continueButton);

    // Step 2: Click Enter Oasis to complete
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /enter oasis/i })).toBeInTheDocument();
    });

    const enterButton = screen.getByRole('button', { name: /enter oasis/i });
    await user.click(enterButton);

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it('shows tenant name in the welcome message', () => {
    render(
      <TestWrapper>
        <WelcomeModal open={true} onComplete={() => {}} />
      </TestWrapper>,
    );

    // Default tenant is "Papaya"
    expect(screen.getByText(/papaya/i)).toBeInTheDocument();
  });
});
