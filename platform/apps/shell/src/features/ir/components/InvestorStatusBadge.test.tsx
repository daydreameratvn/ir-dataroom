import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import InvestorStatusBadge from './InvestorStatusBadge';

describe('InvestorStatusBadge', () => {
  it('renders Invited badge', () => {
    render(<InvestorStatusBadge status="invited" />);
    expect(screen.getByText('Invited')).toBeInTheDocument();
  });

  it('renders NDA Pending badge', () => {
    render(<InvestorStatusBadge status="nda_pending" />);
    expect(screen.getByText('NDA Pending')).toBeInTheDocument();
  });

  it('renders NDA Accepted badge', () => {
    render(<InvestorStatusBadge status="nda_accepted" />);
    expect(screen.getByText('NDA Accepted')).toBeInTheDocument();
  });

  it('renders Active badge', () => {
    render(<InvestorStatusBadge status="active" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders Termsheet Sent badge', () => {
    render(<InvestorStatusBadge status="termsheet_sent" />);
    expect(screen.getByText('Termsheet Sent')).toBeInTheDocument();
  });

  it('renders Termsheet Signed badge', () => {
    render(<InvestorStatusBadge status="termsheet_signed" />);
    expect(screen.getByText('Termsheet Signed')).toBeInTheDocument();
  });

  it('renders Docs Out badge', () => {
    render(<InvestorStatusBadge status="docs_out" />);
    expect(screen.getByText('Docs Out')).toBeInTheDocument();
  });

  it('renders Dropped badge', () => {
    render(<InvestorStatusBadge status="dropped" />);
    expect(screen.getByText('Dropped')).toBeInTheDocument();
  });

  it('renders unknown status as-is', () => {
    render(<InvestorStatusBadge status={'other' as never} />);
    expect(screen.getByText('other')).toBeInTheDocument();
  });
});
