import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TestWrapper, { ensureI18n } from '@/test/wrapper';
import TenantBrandingSettings from './TenantBrandingSettings';

// Mock the tenant branding API
vi.mock('../branding-api', () => ({
  getTenantBranding: vi.fn().mockResolvedValue({
    logoUrl: '',
    faviconUrl: '',
    primaryColor: '#ED1B55',
  }),
  updateTenantBranding: vi.fn().mockResolvedValue({ success: true }),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  await ensureI18n();
});

describe('TenantBrandingSettings', () => {
  it('renders the branding settings form', async () => {
    render(
      <TestWrapper>
        <TenantBrandingSettings />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Tenant Branding')).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/logo url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/favicon url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/primary color/i)).toBeInTheDocument();
  });

  it('shows current tenant name in preview section', async () => {
    render(
      <TestWrapper>
        <TenantBrandingSettings />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Preview')).toBeInTheDocument();
    });
  });

  it('has a save button', async () => {
    render(
      <TestWrapper>
        <TenantBrandingSettings />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    });
  });

  it('allows entering a logo URL', async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <TenantBrandingSettings />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/logo url/i)).toBeInTheDocument();
    });

    const logoInput = screen.getByLabelText(/logo url/i);
    await user.type(logoInput, 'https://example.com/logo.png');

    expect(logoInput).toHaveValue('https://example.com/logo.png');
  });
});
