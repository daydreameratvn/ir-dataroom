import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RoundStatusBadge from './RoundStatusBadge';

describe('RoundStatusBadge', () => {
  it('renders Draft badge for draft status', () => {
    render(<RoundStatusBadge status="draft" />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('renders Active badge for active status', () => {
    render(<RoundStatusBadge status="active" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders Paused badge for paused status', () => {
    render(<RoundStatusBadge status="paused" />);
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });

  it('renders Closed badge for closed status', () => {
    render(<RoundStatusBadge status="closed" />);
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });

  it('renders Archived badge for archived status', () => {
    render(<RoundStatusBadge status="archived" />);
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('renders unknown status as-is', () => {
    render(<RoundStatusBadge status={'unknown' as never} />);
    expect(screen.getByText('unknown')).toBeInTheDocument();
  });
});
