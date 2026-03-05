import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ClaimStatusBadge, { ClaimTypeBadge } from './ClaimStatusBadge';

describe('ClaimStatusBadge', () => {
  const statusCases: [string, string][] = [
    ['SUBMITTED', 'Submitted'],
    ['PROCESSING', 'Processing'],
    ['IN_REVIEW', 'In Review'],
    ['WAITING_FOR_APPROVAL', 'Awaiting Approval'],
    ['APPROVED', 'Approved'],
    ['REJECTED', 'Rejected'],
    ['PENDING', 'Pending'],
    ['SUCCESS', 'Success'],
    ['ERROR', 'Error'],
  ];

  it.each(statusCases)('renders "%s" status as "%s"', (status, label) => {
    render(<ClaimStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('renders unknown status as-is', () => {
    render(<ClaimStatusBadge status="UNKNOWN_STATUS" />);
    expect(screen.getByText('UNKNOWN_STATUS')).toBeInTheDocument();
  });
});

describe('ClaimTypeBadge', () => {
  const typeCases: [string, string][] = [
    ['INPATIENT', 'Inpatient'],
    ['OUTPATIENT', 'Outpatient'],
    ['DENTAL', 'Dental'],
    ['DAY_CASE', 'Day Case'],
    ['MATERNITY', 'Maternity'],
  ];

  it.each(typeCases)('renders "%s" type as "%s"', (type, label) => {
    render(<ClaimTypeBadge type={type} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('renders dash for null type', () => {
    const { container } = render(<ClaimTypeBadge type={null} />);
    expect(container.textContent).toBe('\u2014');
  });

  it('renders unknown type as-is', () => {
    render(<ClaimTypeBadge type="VISION" />);
    expect(screen.getByText('VISION')).toBeInTheDocument();
  });
});
