import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TestWrapper, { ensureI18n } from '@/test/wrapper';
import TenantBranding from './TenantBranding';

beforeEach(async () => {
  await ensureI18n();
});

describe('TenantBranding', () => {
  it('renders tenant initial when no logo is provided', () => {
    render(
      <TestWrapper>
        <TenantBranding />
      </TestWrapper>,
    );

    // Default tenant is "Papaya Insurance", so shows "P"
    expect(screen.getByText('P')).toBeInTheDocument();
  });

  it('renders tenant logo when logoUrl is provided', () => {
    render(
      <TestWrapper>
        <TenantBranding
          logoUrl="https://example.com/logo.png"
          tenantName="Acme Insurance"
        />
      </TestWrapper>,
    );

    const logo = screen.getByAltText('Acme Insurance');
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('src', 'https://example.com/logo.png');
  });

  it('shows tenant name initial as fallback when logo fails to load', () => {
    render(
      <TestWrapper>
        <TenantBranding
          logoUrl="https://example.com/broken.png"
          tenantName="Acme Insurance"
        />
      </TestWrapper>,
    );

    const logo = screen.getByAltText('Acme Insurance');
    fireEvent.error(logo);

    // After error, the initial should be shown instead of the image
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.queryByAltText('Acme Insurance')).not.toBeInTheDocument();
  });

  it('applies custom size when specified', () => {
    render(
      <TestWrapper>
        <TenantBranding size="lg" />
      </TestWrapper>,
    );

    const container = screen.getByTestId('tenant-branding');
    expect(container).toHaveClass('h-10', 'w-10');
  });

  it('applies small size by default', () => {
    render(
      <TestWrapper>
        <TenantBranding />
      </TestWrapper>,
    );

    const container = screen.getByTestId('tenant-branding');
    expect(container).toHaveClass('h-7', 'w-7');
  });
});
