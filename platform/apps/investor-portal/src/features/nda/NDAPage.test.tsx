import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import NDAPage from './NDAPage';

// Mock API module
const mockGetRound = vi.fn();
const mockAcceptNda = vi.fn();

vi.mock('@/lib/api', () => ({
  getRound: (...args: unknown[]) => mockGetRound(...args),
  acceptNda: (...args: unknown[]) => mockAcceptNda(...args),
}));

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderNDAPage(slug = 'test-round') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/rounds/${slug}/nda`]}>
        <Routes>
          <Route path="/rounds/:slug/nda" element={<NDAPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NDAPage', () => {
  it('shows loading spinner when data is loading', () => {
    mockGetRound.mockReturnValue(new Promise(() => {})); // never resolves
    renderNDAPage();
    expect(document.querySelector('.animate-spin')).toBeTruthy();
  });

  it('auto-redirects when NDA is already accepted', async () => {
    mockGetRound.mockResolvedValue({
      ndaAccepted: true,
      ndaRequired: true,
      round: { name: 'Test Round' },
    });

    renderNDAPage();

    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/rounds/test-round/documents', { replace: true });
    });
  });

  it('auto-redirects when NDA is not required', async () => {
    mockGetRound.mockResolvedValue({
      ndaAccepted: false,
      ndaRequired: false,
      round: { name: 'Test Round' },
    });

    renderNDAPage();

    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/rounds/test-round/documents', { replace: true });
    });
  });

  it('renders NDA content when pending acceptance', async () => {
    mockGetRound.mockResolvedValue({
      ndaAccepted: false,
      ndaRequired: true,
      round: { name: 'Series A' },
      ndaTemplate: { content: 'You must keep all information confidential.' },
    });

    renderNDAPage();

    await screen.findByText('Non-Disclosure Agreement');
    expect(screen.getByText(/You must keep all information confidential/)).toBeInTheDocument();
    expect(screen.getByText(/Series A/)).toBeInTheDocument();
  });

  it('shows message when no NDA template exists', async () => {
    mockGetRound.mockResolvedValue({
      ndaAccepted: false,
      ndaRequired: true,
      round: { name: 'Test' },
      ndaTemplate: null,
    });

    renderNDAPage();

    await screen.findByText(/No NDA template has been provided/);
  });

  it('enables Accept button only when checkbox is checked', async () => {
    const user = userEvent.setup();

    mockGetRound.mockResolvedValue({
      ndaAccepted: false,
      ndaRequired: true,
      round: { name: 'Test' },
      ndaTemplate: { content: 'NDA text' },
    });

    renderNDAPage();

    const button = await screen.findByRole('button', { name: /I Accept/i });
    expect(button).toBeDisabled();

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);

    expect(button).toBeEnabled();
  });

  it('disables Accept when no NDA template', async () => {
    mockGetRound.mockResolvedValue({
      ndaAccepted: false,
      ndaRequired: true,
      round: { name: 'Test' },
      ndaTemplate: null,
    });

    renderNDAPage();

    // The button should exist but be disabled since no template
    await vi.waitFor(() => {
      const buttons = screen.getAllByRole('button');
      const acceptButton = buttons.find((b) => b.textContent?.includes('Accept'));
      expect(acceptButton).toBeTruthy();
      expect(acceptButton).toBeDisabled();
    });
  });
});
