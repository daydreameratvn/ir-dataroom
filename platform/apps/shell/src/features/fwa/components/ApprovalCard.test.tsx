import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ApprovalCard from './ApprovalCard';

describe('ApprovalCard', () => {
  const defaultProps = {
    toolCallId: 'tc-1',
    toolName: 'assessBenefit',
    params: { amount: 500000, benefitType: 'OutPatient' },
    status: 'pending' as const,
    onApprove: vi.fn(),
    onDeny: vi.fn(),
  };

  it('renders the tool label and params', () => {
    render(<ApprovalCard {...defaultProps} />);

    expect(screen.getByText('Approval Required: Assess Benefit')).toBeInTheDocument();
    expect(screen.getByText('amount')).toBeInTheDocument();
    // Intl.NumberFormat with 'vi-VN' uses '.' as thousands separator
    expect(screen.getByText('500.000')).toBeInTheDocument();
    expect(screen.getByText('benefitType')).toBeInTheDocument();
    expect(screen.getByText('OutPatient')).toBeInTheDocument();
  });

  it('shows approve and deny buttons when pending', () => {
    render(<ApprovalCard {...defaultProps} />);

    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /deny/i })).toBeInTheDocument();
  });

  it('calls onApprove when approve is clicked', () => {
    render(<ApprovalCard {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(defaultProps.onApprove).toHaveBeenCalledWith('tc-1');
  });

  it('calls onDeny when deny is clicked', () => {
    render(<ApprovalCard {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /deny/i }));
    expect(defaultProps.onDeny).toHaveBeenCalledWith('tc-1');
  });

  it('shows Approved badge and hides buttons when approved', () => {
    render(<ApprovalCard {...defaultProps} status="approved" />);

    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /deny/i })).not.toBeInTheDocument();
  });

  it('shows Denied badge and hides buttons when denied', () => {
    render(<ApprovalCard {...defaultProps} status="denied" />);

    expect(screen.getByText('Denied')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /deny/i })).not.toBeInTheDocument();
  });

  it('renders unknown tool names as-is', () => {
    render(<ApprovalCard {...defaultProps} toolName="customTool" />);

    expect(screen.getByText('Approval Required: customTool')).toBeInTheDocument();
  });
});
