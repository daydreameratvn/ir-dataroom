import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import IncidentTimeline from './IncidentTimeline';
import type { IncidentUpdate } from '../types';

const mockUpdates: IncidentUpdate[] = [
  {
    id: 'upd-1',
    incidentId: 'inc-1',
    status: 'investigating',
    message: 'We are aware of the issue and investigating.',
    createdAt: '2026-02-28T10:00:00Z',
    createdBy: null,
  },
  {
    id: 'upd-2',
    incidentId: 'inc-1',
    status: 'identified',
    message: 'The root cause has been identified.',
    createdAt: '2026-02-28T10:30:00Z',
    createdBy: null,
  },
  {
    id: 'upd-3',
    incidentId: 'inc-1',
    status: 'resolved',
    message: 'The issue has been resolved.',
    createdAt: '2026-02-28T11:00:00Z',
    createdBy: null,
  },
];

describe('IncidentTimeline', () => {
  it('shows "No updates yet" when empty', () => {
    render(<IncidentTimeline updates={[]} />);

    expect(screen.getByText('No updates yet.')).toBeInTheDocument();
  });

  it('renders all update messages', () => {
    render(<IncidentTimeline updates={mockUpdates} />);

    expect(screen.getByText('We are aware of the issue and investigating.')).toBeInTheDocument();
    expect(screen.getByText('The root cause has been identified.')).toBeInTheDocument();
    expect(screen.getByText('The issue has been resolved.')).toBeInTheDocument();
  });

  it('renders status labels for each update', () => {
    render(<IncidentTimeline updates={mockUpdates} />);

    expect(screen.getByText('investigating')).toBeInTheDocument();
    expect(screen.getByText('identified')).toBeInTheDocument();
    expect(screen.getByText('resolved')).toBeInTheDocument();
  });

  it('renders timestamps', () => {
    render(<IncidentTimeline updates={mockUpdates} />);

    // Just verify timestamps are rendered (locale format varies)
    const timestamps = screen.getAllByText(/Feb.*28/);
    expect(timestamps.length).toBeGreaterThanOrEqual(3);
  });

  it('renders a single update', () => {
    render(<IncidentTimeline updates={[mockUpdates[0]!]} />);

    expect(screen.getByText('We are aware of the issue and investigating.')).toBeInTheDocument();
    expect(screen.getByText('investigating')).toBeInTheDocument();
  });
});
