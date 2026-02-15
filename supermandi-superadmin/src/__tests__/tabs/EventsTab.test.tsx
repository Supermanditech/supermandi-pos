// SuperAdmin — Test EventsTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EventsTab } from '../../tabs/EventsTab';
import type { PosEvent } from '../../api/posEvents';

vi.mock('../../lib/formatters', () => ({
  formatDateTime: vi.fn((v: string) => v || '--'),
}));

vi.mock('../../components/PayloadDetails', () => ({
  PayloadDetails: ({ payload }: { payload: unknown }) => <span data-testid="payload">{JSON.stringify(payload)}</span>,
}));

const makeEvent = (overrides: Partial<PosEvent> = {}): PosEvent => ({
  id: 'e1',
  deviceId: 'd1',
  storeId: 's1',
  eventType: 'SALE',
  payload: { amount: 100 },
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

function createProps(overrides: Partial<Parameters<typeof EventsTab>[0]> = {}) {
  return {
    filteredEvents: [],
    pageEvents: [],
    grouped: [],
    groupBy: 'none' as const,
    page: 0,
    setPage: vi.fn(),
    pageSize: 50,
    ...overrides,
  };
}

describe('EventsTab', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders header', () => {
    render(<EventsTab {...createProps()} />);
    expect(screen.getByText('Event Stream')).toBeTruthy();
  });

  it('shows empty state', () => {
    render(<EventsTab {...createProps()} />);
    expect(screen.getByText('No events found for the current filters.')).toBeTruthy();
  });

  it('renders event rows', () => {
    const events = [makeEvent()];
    render(<EventsTab {...createProps({ filteredEvents: events, pageEvents: events })} />);
    expect(screen.getByText('d1')).toBeTruthy();
    expect(screen.getByText('s1')).toBeTruthy();
    expect(screen.getByText('SALE')).toBeTruthy();
  });

  it('shows filtered event count', () => {
    const events = [makeEvent(), makeEvent({ id: 'e2' })];
    render(<EventsTab {...createProps({ filteredEvents: events })} />);
    expect(screen.getByText('Showing 2 events (newest first)')).toBeTruthy();
  });

  it('shows grouped view when groupBy is not none', () => {
    const grouped = [{ key: 'tx-1', count: 5, lastSeen: '2026-01-01', lastEventType: 'SALE' }];
    render(<EventsTab {...createProps({ groupBy: 'transactionId', grouped })} />);
    expect(screen.getByText('tx-1')).toBeTruthy();
  });

  it('shows pagination controls', () => {
    render(<EventsTab {...createProps({ filteredEvents: Array(100).fill(makeEvent()), pageSize: 50 })} />);
    expect(screen.getByText('Page 1 / 2')).toBeTruthy();
  });

  it('calls setPage on Prev click', () => {
    const setPage = vi.fn();
    render(<EventsTab {...createProps({ setPage, page: 1 })} />);
    fireEvent.click(screen.getByText('Prev'));
    expect(setPage).toHaveBeenCalled();
  });

  it('calls setPage on Next click', () => {
    const setPage = vi.fn();
    render(<EventsTab {...createProps({ setPage, filteredEvents: Array(100).fill(makeEvent()), pageSize: 50 })} />);
    fireEvent.click(screen.getByText('Next'));
    expect(setPage).toHaveBeenCalled();
  });
});
