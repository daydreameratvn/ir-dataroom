import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TestWrapper, { ensureI18n } from '@/test/wrapper';
import FWAPage from './FWAPage';

// Mock the API module
vi.mock('./api', () => ({
  startAssessment: vi.fn(),
  sendApproval: vi.fn(),
  listPendingAssessments: vi.fn().mockResolvedValue([]),
  startComplianceCheck: vi.fn(),
  quickComplianceCheck: vi.fn(),
  startScourgeJob: vi.fn(),
  listScourgeJobs: vi.fn().mockResolvedValue([]),
  getScourgeJob: vi.fn(),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  await ensureI18n();
});

describe('FWAPage', () => {
  it('renders the page header', () => {
    render(
      <TestWrapper>
        <FWAPage />
      </TestWrapper>,
    );

    expect(screen.getByText('FWA Detection')).toBeInTheDocument();
    expect(screen.getByText('Fraud, waste, and abuse detection agents')).toBeInTheDocument();
  });

  it('renders all four tabs', () => {
    render(
      <TestWrapper>
        <FWAPage />
      </TestWrapper>,
    );

    expect(screen.getByRole('tab', { name: 'Assessment' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Compliance' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Scourge' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Pending' })).toBeInTheDocument();
  });

  it('defaults to Assessment tab with claim code input', () => {
    render(
      <TestWrapper>
        <FWAPage />
      </TestWrapper>,
    );

    const assessmentTab = screen.getByRole('tab', { name: 'Assessment' });
    expect(assessmentTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByPlaceholderText('Enter claim code to assess...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Assessment' })).toBeInTheDocument();
  });

  it('disables Start Assessment button when input is empty', () => {
    render(
      <TestWrapper>
        <FWAPage />
      </TestWrapper>,
    );

    const button = screen.getByRole('button', { name: 'Start Assessment' });
    expect(button).toBeDisabled();
  });

  it('switches to Compliance tab on click', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <FWAPage />
      </TestWrapper>,
    );

    await user.click(screen.getByRole('tab', { name: 'Compliance' }));

    expect(screen.getByRole('tab', { name: 'Compliance' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Run Compliance Check' })).toBeInTheDocument();
  });

  it('switches to Scourge tab on click', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <FWAPage />
      </TestWrapper>,
    );

    await user.click(screen.getByRole('tab', { name: 'Scourge' }));

    expect(screen.getByRole('tab', { name: 'Scourge' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Start Scourge' })).toBeInTheDocument();
  });

  it('switches to Pending tab on click', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <FWAPage />
      </TestWrapper>,
    );

    await user.click(screen.getByRole('tab', { name: 'Pending' }));

    expect(screen.getByRole('tab', { name: 'Pending' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
