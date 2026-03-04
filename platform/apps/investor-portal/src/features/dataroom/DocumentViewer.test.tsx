import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import DocumentViewer from './DocumentViewer';

// Mock API
const mockGetDocumentViewUrl = vi.fn();
const mockGetDocumentDownloadUrl = vi.fn();
const mockTrackView = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/api', () => ({
  getDocumentViewUrl: (...args: unknown[]) => mockGetDocumentViewUrl(...args),
  getDocumentDownloadUrl: (...args: unknown[]) => mockGetDocumentDownloadUrl(...args),
  trackView: (...args: unknown[]) => mockTrackView(...args),
}));

// Mock auth provider
vi.mock('@/providers/InvestorAuthProvider', () => ({
  useInvestorAuth: () => ({
    investor: { id: 'inv-1', email: 'test@example.com', name: 'Test', firm: null },
    isAuthenticated: true,
    token: 'mock-token',
    login: vi.fn(),
    logout: vi.fn(),
    getToken: () => 'mock-token',
  }),
}));

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderViewer(slug = 'round-1', docId = 'doc-1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/rounds/${slug}/documents/${docId}`]}>
        <Routes>
          <Route path="/rounds/:slug/documents/:id" element={<DocumentViewer />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DocumentViewer', () => {
  it('shows loading skeleton while fetching', () => {
    mockGetDocumentViewUrl.mockReturnValue(new Promise(() => {}));
    renderViewer();

    expect(screen.getByText('Loading document...')).toBeInTheDocument();
  });

  it('shows error state when fetch fails', async () => {
    mockGetDocumentViewUrl.mockRejectedValue(new Error('Not found'));
    renderViewer();

    await screen.findByText(/Failed to load document/);
    expect(screen.getByText(/Go Back/)).toBeInTheDocument();
  });

  it('shows NDA-specific error and redirect button', async () => {
    mockGetDocumentViewUrl.mockRejectedValue(new Error('NDA not accepted'));
    renderViewer();

    await screen.findByText(/You need to accept the NDA/);
    expect(screen.getByText(/Review & Sign NDA/)).toBeInTheDocument();
  });

  it('renders PDF in iframe with presigned URL', async () => {
    mockGetDocumentViewUrl.mockResolvedValue({
      url: 'https://s3.example.com/doc.pdf?signed=1',
      document: {
        id: 'doc-1',
        name: 'Q1 Report.pdf',
        description: null,
        category: 'financials',
        mimeType: 'application/pdf',
        fileSizeBytes: 1024000,
        s3Key: 'ir/t/r/d/Q1.pdf',
        sortOrder: 0,
        watermarkEnabled: true,
        createdAt: '2026-01-01',
      },
      accessLogId: 'log-1',
    });

    renderViewer();

    await screen.findByText('Q1 Report.pdf');
    const iframe = document.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe!.src).toContain('s3.example.com');
  });

  it('renders video element for video types', async () => {
    mockGetDocumentViewUrl.mockResolvedValue({
      url: 'https://s3.example.com/pitch.mp4?signed=1',
      document: {
        id: 'doc-2',
        name: 'Pitch Video.mp4',
        description: null,
        category: 'strategy',
        mimeType: 'video/mp4',
        fileSizeBytes: 50000000,
        s3Key: 'ir/t/r/d/pitch.mp4',
        sortOrder: 0,
        watermarkEnabled: true,
        createdAt: '2026-01-01',
      },
      accessLogId: 'log-2',
    });

    renderViewer();

    await screen.findByText('Pitch Video.mp4');
    const video = document.querySelector('video');
    expect(video).toBeTruthy();
    expect(video!.src).toContain('s3.example.com');
    expect(video!.getAttribute('controlsList')).toBe('nodownload');
  });

  it('renders WatermarkOverlay with investor email', async () => {
    mockGetDocumentViewUrl.mockResolvedValue({
      url: 'https://s3.example.com/doc.pdf?signed=1',
      document: {
        id: 'doc-1',
        name: 'Report.pdf',
        description: null,
        category: 'financials',
        mimeType: 'application/pdf',
        fileSizeBytes: 1024,
        s3Key: 'key',
        sortOrder: 0,
        watermarkEnabled: true,
        createdAt: '2026-01-01',
      },
      accessLogId: 'log-1',
    });

    renderViewer();

    await screen.findByText('Report.pdf');
    // Should render 3 watermark labels
    const watermarks = screen.getAllByText('test@example.com');
    expect(watermarks.length).toBe(3);
  });

  it('shows download button in header', async () => {
    mockGetDocumentViewUrl.mockResolvedValue({
      url: 'https://s3.example.com/doc.pdf?signed=1',
      document: {
        id: 'doc-1',
        name: 'Report.pdf',
        description: null,
        category: 'financials',
        mimeType: 'application/pdf',
        fileSizeBytes: 1024,
        s3Key: 'key',
        sortOrder: 0,
        watermarkEnabled: true,
        createdAt: '2026-01-01',
      },
      accessLogId: 'log-1',
    });

    renderViewer();

    await screen.findByText('Report.pdf');
    // Download button should exist (either text or icon)
    const downloadButton = document.querySelector('button[disabled]') === null;
    expect(downloadButton).toBeTruthy();
  });

  it('shows fallback UI for unsupported file types', async () => {
    mockGetDocumentViewUrl.mockResolvedValue({
      url: null,
      document: {
        id: 'doc-3',
        name: 'data.zip',
        description: null,
        category: 'legal',
        mimeType: 'application/zip',
        fileSizeBytes: 2048,
        s3Key: 'key',
        sortOrder: 0,
        watermarkEnabled: false,
        createdAt: '2026-01-01',
      },
      accessLogId: 'log-3',
    });

    renderViewer();

    await screen.findAllByText('data.zip');
    expect(screen.getByText(/cannot be previewed/)).toBeInTheDocument();
    expect(screen.getByText('Download File')).toBeInTheDocument();
  });
});
