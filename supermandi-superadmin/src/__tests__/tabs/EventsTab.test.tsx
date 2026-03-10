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
    filteredEvents: [] as PosEvent[],
    pageEvents: [] as PosEvent[],
    grouped: [] as Array<{ key: string; count: number; lastSeen: string; lastEventType: string }>,
    groupBy: 'none' as const,
    page: 0,
    setPage: vi.fn(),
    pageSize: 50,
    ...overrides,
  };
}

describe('EventsTab', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ── Header & Empty ──────────────────────────────────────────

  it('renders header title', () => {
    render(<EventsTab {...createProps()} />);
    expect(screen.getByText('Event Stream')).toBeTruthy();
  });

  it('shows empty state when no events', () => {
    render(<EventsTab {...createProps()} />);
    expect(screen.getByText('No events found for the current filters.')).toBeTruthy();
  });

  it('shows 0 events count in subtitle', () => {
    render(<EventsTab {...createProps()} />);
    expect(screen.getByText('Showing 0 events (newest first)')).toBeTruthy();
  });

  // ── Event Table ─────────────────────────────────────────────

  it('renders event rows with device/store/type', () => {
    const events = [makeEvent()];
    render(<EventsTab {...createProps({ filteredEvents: events, pageEvents: events })} />);
    expect(screen.getByText('d1')).toBeTruthy();
    expect(screen.getByText('s1')).toBeTruthy();
    expect(screen.getByText('SALE')).toBeTruthy();
  });

  it('renders table column headers', () => {
    const events = [makeEvent()];
    render(<EventsTab {...createProps({ filteredEvents: events, pageEvents: events })} />);
    expect(screen.getByText('Timestamp')).toBeTruthy();
    expect(screen.getByText('Device ID')).toBeTruthy();
    expect(screen.getByText('Store ID')).toBeTruthy();
    expect(screen.getByText('Event Type')).toBeTruthy();
    expect(screen.getByText('Payload')).toBeTruthy();
  });

  it('renders formatted timestamp via formatDateTime', () => {
    const events = [makeEvent({ createdAt: '2026-03-10T10:00:00Z' })];
    render(<EventsTab {...createProps({ filteredEvents: events, pageEvents: events })} />);
    expect(screen.getByText('2026-03-10T10:00:00Z')).toBeTruthy();
  });

  it('renders payload via PayloadDetails component', () => {
    const events = [makeEvent({ payload: { method: 'UPI', amount: 500 } })];
    render(<EventsTab {...createProps({ filteredEvents: events, pageEvents: events })} />);
    const payloadEl = screen.getByTestId('payload');
    expect(payloadEl.textContent).toContain('UPI');
    expect(payloadEl.textContent).toContain('500');
  });

  it('renders multiple event rows', () => {
    const events = [
      makeEvent({ id: 'e1', eventType: 'SALE' }),
      makeEvent({ id: 'e2', eventType: 'REFUND', deviceId: 'd2' }),
      makeEvent({ id: 'e3', eventType: 'STOCK_IN', storeId: 's2' }),
    ];
    render(<EventsTab {...createProps({ filteredEvents: events, pageEvents: events })} />);
    expect(screen.getByText('SALE')).toBeTruthy();
    expect(screen.getByText('REFUND')).toBeTruthy();
    expect(screen.getByText('STOCK_IN')).toBeTruthy();
    expect(screen.getByText('d2')).toBeTruthy();
    expect(screen.getByText('s2')).toBeTruthy();
  });

  it('shows filtered event count in subtitle', () => {
    const events = [makeEvent(), makeEvent({ id: 'e2' }), makeEvent({ id: 'e3' })];
    render(<EventsTab {...createProps({ filteredEvents: events })} />);
    expect(screen.getByText('Showing 3 events (newest first)')).toBeTruthy();
  });

  // ── Loading State ───────────────────────────────────────────

  it('shows loading indicator when loading', () => {
    render(<EventsTab {...createProps({ loading: true })} />);
    expect(screen.getByText(/Loading events/)).toBeTruthy();
  });

  it('does not show loading indicator when not loading', () => {
    render(<EventsTab {...createProps({ loading: false })} />);
    expect(screen.queryByText(/Loading events/)).toBeNull();
  });

  // ── Error State ─────────────────────────────────────────────

  it('shows error banner when error is set', () => {
    render(<EventsTab {...createProps({ error: 'Network timeout' })} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Network timeout')).toBeTruthy();
  });

  it('does not show error banner when no error', () => {
    render(<EventsTab {...createProps()} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // ── Grouped View ────────────────────────────────────────────

  it('shows grouped view when groupBy is not none', () => {
    const grouped = [{ key: 'tx-1', count: 5, lastSeen: '2026-01-01', lastEventType: 'SALE' }];
    render(<EventsTab {...createProps({ groupBy: 'transactionId', grouped })} />);
    expect(screen.getByText('tx-1')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('shows groupBy label in grouped header', () => {
    const grouped = [{ key: 'g1', count: 1, lastSeen: '2026-01-01', lastEventType: 'SALE' }];
    render(<EventsTab {...createProps({ groupBy: 'deviceId', grouped })} />);
    // "deviceId" appears in both grouped header text and th column — check both exist
    const deviceIdElements = screen.getAllByText('deviceId');
    expect(deviceIdElements.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Grouped by/)).toBeTruthy();
  });

  it('shows group count in grouped header', () => {
    const grouped = [
      { key: 'g1', count: 3, lastSeen: '2026-01-01', lastEventType: 'SALE' },
      { key: 'g2', count: 7, lastSeen: '2026-01-02', lastEventType: 'REFUND' },
    ];
    render(<EventsTab {...createProps({ groupBy: 'storeId', grouped })} />);
    expect(screen.getByText(/showing 2 groups/)).toBeTruthy();
  });

  it('renders grouped table column headers', () => {
    const grouped = [{ key: 'g1', count: 1, lastSeen: '2026-01-01', lastEventType: 'SALE' }];
    render(<EventsTab {...createProps({ groupBy: 'deviceId', grouped })} />);
    expect(screen.getByText('Count')).toBeTruthy();
    expect(screen.getByText('Last seen')).toBeTruthy();
    expect(screen.getByText('Last event')).toBeTruthy();
  });

  it('renders last event type in grouped rows', () => {
    const grouped = [{ key: 'g1', count: 10, lastSeen: '2026-03-01', lastEventType: 'PAYMENT_COMPLETED' }];
    render(<EventsTab {...createProps({ groupBy: 'storeId', grouped })} />);
    expect(screen.getByText('PAYMENT_COMPLETED')).toBeTruthy();
  });

  it('does not render grouped table when groupBy is none', () => {
    render(<EventsTab {...createProps({ groupBy: 'none' })} />);
    expect(screen.queryByText(/Grouped by/)).toBeNull();
  });

  it('shows truncation notice when grouped > 50', () => {
    const grouped = Array.from({ length: 55 }, (_, i) => ({
      key: `g-${i}`,
      count: i + 1,
      lastSeen: '2026-01-01',
      lastEventType: 'SALE',
    }));
    render(<EventsTab {...createProps({ groupBy: 'deviceId', grouped })} />);
    expect(screen.getByText('Showing first 50 groups.')).toBeTruthy();
  });

  it('does not show truncation notice when grouped <= 50', () => {
    const grouped = Array.from({ length: 10 }, (_, i) => ({
      key: `g-${i}`,
      count: i + 1,
      lastSeen: '2026-01-01',
      lastEventType: 'SALE',
    }));
    render(<EventsTab {...createProps({ groupBy: 'deviceId', grouped })} />);
    expect(screen.queryByText('Showing first 50 groups.')).toBeNull();
  });

  // ── Pagination ──────────────────────────────────────────────

  it('shows pagination controls', () => {
    render(<EventsTab {...createProps({ filteredEvents: Array(100).fill(makeEvent()), pageSize: 50 })} />);
    expect(screen.getByText('Page 1 / 2')).toBeTruthy();
  });

  it('shows page 1 of 1 for single page', () => {
    const events = [makeEvent()];
    render(<EventsTab {...createProps({ filteredEvents: events, pageEvents: events })} />);
    expect(screen.getByText('Page 1 / 1')).toBeTruthy();
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

  it('disables Prev on first page', () => {
    render(<EventsTab {...createProps({ page: 0 })} />);
    expect(screen.getByText('Prev')).toHaveProperty('disabled', true);
  });

  it('disables Next on last page', () => {
    const events = Array(50).fill(makeEvent());
    render(<EventsTab {...createProps({ filteredEvents: events, pageSize: 50, page: 0 })} />);
    expect(screen.getByText('Next')).toHaveProperty('disabled', true);
  });

  it('enables Next when more pages exist', () => {
    const events = Array(100).fill(makeEvent());
    render(<EventsTab {...createProps({ filteredEvents: events, pageSize: 50, page: 0 })} />);
    expect(screen.getByText('Next')).toHaveProperty('disabled', false);
  });

  it('enables Prev when not on first page', () => {
    const events = Array(100).fill(makeEvent());
    render(<EventsTab {...createProps({ filteredEvents: events, pageSize: 50, page: 1 })} />);
    expect(screen.getByText('Prev')).toHaveProperty('disabled', false);
  });

  it('shows correct page count for 150 events with pageSize 50', () => {
    const events = Array(150).fill(makeEvent());
    render(<EventsTab {...createProps({ filteredEvents: events, pageSize: 50, page: 0 })} />);
    expect(screen.getByText('Page 1 / 3')).toBeTruthy();
  });

  // ── Edge Cases ──────────────────────────────────────────────

  it('handles empty payload gracefully', () => {
    const events = [makeEvent({ payload: {} })];
    render(<EventsTab {...createProps({ filteredEvents: events, pageEvents: events })} />);
    const payloadEl = screen.getByTestId('payload');
    expect(payloadEl.textContent).toBe('{}');
  });

  it('renders both loading and events simultaneously', () => {
    const events = [makeEvent()];
    render(<EventsTab {...createProps({ filteredEvents: events, pageEvents: events, loading: true })} />);
    expect(screen.getByText(/Loading events/)).toBeTruthy();
    expect(screen.getByText('SALE')).toBeTruthy();
  });

  it('renders both error and events simultaneously', () => {
    const events = [makeEvent()];
    render(<EventsTab {...createProps({ filteredEvents: events, pageEvents: events, error: 'Partial failure' })} />);
    expect(screen.getByText('Partial failure')).toBeTruthy();
    expect(screen.getByText('SALE')).toBeTruthy();
  });
});
