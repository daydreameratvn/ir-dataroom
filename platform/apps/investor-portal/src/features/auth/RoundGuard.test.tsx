import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RoundGuard from './RoundGuard';

// Mock API
const mockGetRound = vi.fn();

vi.mock('@/lib/api', () => ({
  getRound: (...args: unknown[]) => mockGetRound(...args),
}));

function renderWithRound(slug = 'test-round', path = `/rounds/${slug}/documents`) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/rounds/:slug" element={<RoundGuard />}>
            <Route path="documents" element={<div>Documents Page</div>} />
            <Route path="nda" element={<div>NDA Page</div>} />
          </Route>
          <Route path="/" element={<div>Home Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RoundGuard', () => {
  it('shows loading spinner while fetching round', () => {
    mockGetRound.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithRound();

    expect(document.querySelector('.animate-spin')).toBeTruthy();
  });

  it('redirects to / when round fetch fails', async () => {
    mockGetRound.mockRejectedValue(new Error('Not found'));
    renderWithRound();

    await screen.findByText('Home Page');
    expect(screen.queryByText('Documents Page')).not.toBeInTheDocument();
  });

  it('redirects to NDA page when NDA required but not accepted', async () => {
    mockGetRound.mockResolvedValue({
      ndaRequired: true,
      ndaAccepted: false,
      round: { name: 'Series A' },
      ndaTemplate: { id: 'nda-1', content: 'NDA text', version: 1 },
    });

    renderWithRound('test-round', '/rounds/test-round/documents');

    await screen.findByText('NDA Page');
    expect(screen.queryByText('Documents Page')).not.toBeInTheDocument();
  });

  it('renders Outlet when NDA accepted', async () => {
    mockGetRound.mockResolvedValue({
      ndaRequired: true,
      ndaAccepted: true,
      round: { name: 'Series A' },
      ndaTemplate: { id: 'nda-1', content: 'NDA text', version: 1 },
    });

    renderWithRound();

    await screen.findByText('Documents Page');
  });

  it('renders Outlet when NDA not required', async () => {
    mockGetRound.mockResolvedValue({
      ndaRequired: false,
      ndaAccepted: false,
      round: { name: 'Series A' },
      ndaTemplate: null,
    });

    renderWithRound();

    await screen.findByText('Documents Page');
  });

  it('stays on NDA page without redirect loop when on /nda path', async () => {
    mockGetRound.mockResolvedValue({
      ndaRequired: true,
      ndaAccepted: false,
      round: { name: 'Series A' },
      ndaTemplate: { id: 'nda-1', content: 'NDA text', version: 1 },
    });

    renderWithRound('test-round', '/rounds/test-round/nda');

    await screen.findByText('NDA Page');
    // Should NOT redirect away — we're already on /nda
    expect(screen.queryByText('Documents Page')).not.toBeInTheDocument();
    expect(screen.queryByText('Home Page')).not.toBeInTheDocument();
  });
});
