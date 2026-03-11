// SuperAdmin — Test PaymentsTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PaymentsTab } from '../../tabs/PaymentsTab';
import type { PosEvent } from '../../api/posEvents';

vi.mock('../../lib/formatters', () => ({
  formatDateTime: vi.fn((v: string) => v || '--'),
}));

vi.mock('../../components/PayloadDetails', () => ({
  PayloadDetails: ({ payload }: { payload: unknown }) => <span data-testid="payload">{JSON.stringify(payload)}</span>,
}));

const makePaymentEvent = (overrides: Partial<PosEvent> = {}): PosEvent => ({
  id: 'pay-1',
  deviceId: 'd1',
  storeId: 's1',
  eventType: 'PAYMENT_COMPLETED',
  payload: { amount: 5000, method: 'UPI' },
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('PaymentsTab', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ── Header ──────────────────────────────────────────────────

  it('renders header title', () => {
    render(<PaymentsTab paymentEvents={[]} />);
    expect(screen.getByText('Payments')).toBeTruthy();
  });

  it('renders subtitle description', () => {
    render(<PaymentsTab paymentEvents={[]} />);
    expect(screen.getByText(/Events where eventType starts with PAYMENT_/)).toBeTruthy();
  });

  // ── Empty State ─────────────────────────────────────────────

  it('shows empty state when no events', () => {
    render(<PaymentsTab paymentEvents={[]} />);
    expect(screen.getByText('No payment events found for the current filters.')).toBeTruthy();
  });

  // ── Loading State ───────────────────────────────────────────

  it('shows loading message when loading', () => {
    render(<PaymentsTab paymentEvents={[]} loading={true} />);
    expect(screen.getByText('Loading payment events...')).toBeTruthy();
  });

  it('does not show empty state when loading', () => {
    render(<PaymentsTab paymentEvents={[]} loading={true} />);
    expect(screen.queryByText('No payment events found for the current filters.')).toBeNull();
  });

  it('does not show loading when not loading', () => {
    render(<PaymentsTab paymentEvents={[]} loading={false} />);
    expect(screen.queryByText('Loading payment events...')).toBeNull();
  });

  // ── Error State ─────────────────────────────────────────────

  it('shows error message when error is set', () => {
    render(<PaymentsTab paymentEvents={[]} error="Failed to load" />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Failed to load')).toBeTruthy();
  });

  it('does not show empty state when error is set', () => {
    render(<PaymentsTab paymentEvents={[]} error="Failed" />);
    expect(screen.queryByText('No payment events found for the current filters.')).toBeNull();
  });

  it('does not show error when no error', () => {
    render(<PaymentsTab paymentEvents={[]} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // ── Table Headers ───────────────────────────────────────────

  it('renders table column headers', () => {
    const events = [makePaymentEvent()];
    render(<PaymentsTab paymentEvents={events} />);
    expect(screen.getByText('Timestamp')).toBeTruthy();
    expect(screen.getByText('Device ID')).toBeTruthy();
    expect(screen.getByText('Store ID')).toBeTruthy();
    expect(screen.getByText('Event Type')).toBeTruthy();
    expect(screen.getByText('Payload')).toBeTruthy();
  });

  // ── Event Rows ──────────────────────────────────────────────

  it('renders payment event row data', () => {
    const events = [makePaymentEvent()];
    render(<PaymentsTab paymentEvents={events} />);
    expect(screen.getByText('d1')).toBeTruthy();
    expect(screen.getByText('s1')).toBeTruthy();
    expect(screen.getByText('PAYMENT_COMPLETED')).toBeTruthy();
  });

  it('renders formatted timestamp', () => {
    const events = [makePaymentEvent({ createdAt: '2026-03-10T15:30:00Z' })];
    render(<PaymentsTab paymentEvents={events} />);
    expect(screen.getByText('2026-03-10T15:30:00Z')).toBeTruthy();
  });

  it('renders payload via PayloadDetails', () => {
    const events = [makePaymentEvent({ payload: { method: 'CASH', amount: 1200 } })];
    render(<PaymentsTab paymentEvents={events} />);
    const payloadEl = screen.getByTestId('payload');
    expect(payloadEl.textContent).toContain('CASH');
    expect(payloadEl.textContent).toContain('1200');
  });

  it('renders multiple events', () => {
    const events = [
      makePaymentEvent({ id: 'p1', eventType: 'PAYMENT_COMPLETED' }),
      makePaymentEvent({ id: 'p2', eventType: 'PAYMENT_FAILED' }),
    ];
    render(<PaymentsTab paymentEvents={events} />);
    expect(screen.getByText('PAYMENT_COMPLETED')).toBeTruthy();
    expect(screen.getByText('PAYMENT_FAILED')).toBeTruthy();
  });

  it('renders different device and store IDs', () => {
    const events = [
      makePaymentEvent({ id: 'p1', deviceId: 'dev-A', storeId: 'store-X' }),
      makePaymentEvent({ id: 'p2', deviceId: 'dev-B', storeId: 'store-Y' }),
    ];
    render(<PaymentsTab paymentEvents={events} />);
    expect(screen.getByText('dev-A')).toBeTruthy();
    expect(screen.getByText('dev-B')).toBeTruthy();
    expect(screen.getByText('store-X')).toBeTruthy();
    expect(screen.getByText('store-Y')).toBeTruthy();
  });

  // ── Pagination ──────────────────────────────────────────────

  it('does not show pagination for events under page size', () => {
    const events = Array.from({ length: 10 }, (_, i) => makePaymentEvent({ id: `p-${i}` }));
    render(<PaymentsTab paymentEvents={events} />);
    expect(screen.queryByText(/Page/)).toBeNull();
  });

  it('shows pagination when events exceed page size', () => {
    const events = Array.from({ length: 60 }, (_, i) => makePaymentEvent({ id: `p-${i}` }));
    render(<PaymentsTab paymentEvents={events} />);
    expect(screen.getByText(/Page 1/)).toBeTruthy();
    expect(screen.getByText(/60 total/)).toBeTruthy();
  });

  it('shows prev button disabled on first page', () => {
    const events = Array.from({ length: 60 }, (_, i) => makePaymentEvent({ id: `p-${i}` }));
    render(<PaymentsTab paymentEvents={events} />);
    expect(screen.getByText('←')).toHaveProperty('disabled', true);
  });

  it('shows next button enabled when more pages', () => {
    const events = Array.from({ length: 60 }, (_, i) => makePaymentEvent({ id: `p-${i}` }));
    render(<PaymentsTab paymentEvents={events} />);
    expect(screen.getByText('→')).toHaveProperty('disabled', false);
  });

  it('shows correct page count for 120 events', () => {
    const events = Array.from({ length: 120 }, (_, i) => makePaymentEvent({ id: `p-${i}` }));
    render(<PaymentsTab paymentEvents={events} />);
    expect(screen.getByText(/Page 1 \/ 3/)).toBeTruthy();
  });

  // ── Edge Cases ──────────────────────────────────────────────

  it('handles event with empty payload', () => {
    const events = [makePaymentEvent({ payload: {} })];
    render(<PaymentsTab paymentEvents={events} />);
    const payloadEl = screen.getByTestId('payload');
    expect(payloadEl.textContent).toBe('{}');
  });

  it('handles single event without pagination', () => {
    const events = [makePaymentEvent()];
    render(<PaymentsTab paymentEvents={events} />);
    expect(screen.queryByText(/Page/)).toBeNull();
    expect(screen.getByText('d1')).toBeTruthy();
  });

  // ── Pagination Navigation ─────────────────────────────────────

  it('navigates to next page on → click', () => {
    const events = Array.from({ length: 60 }, (_, i) => makePaymentEvent({ id: `p-${i}`, deviceId: `dev-${i}` }));
    render(<PaymentsTab paymentEvents={events} />);
    expect(screen.getByText(/Page 1/)).toBeTruthy();
    fireEvent.click(screen.getByText('→'));
    expect(screen.getByText(/Page 2/)).toBeTruthy();
  });

  it('navigates back on ← click after going to page 2', () => {
    const events = Array.from({ length: 60 }, (_, i) => makePaymentEvent({ id: `p-${i}` }));
    render(<PaymentsTab paymentEvents={events} />);
    fireEvent.click(screen.getByText('→'));
    expect(screen.getByText(/Page 2/)).toBeTruthy();
    fireEvent.click(screen.getByText('←'));
    expect(screen.getByText(/Page 1/)).toBeTruthy();
  });

  it('disables → on last page', () => {
    const events = Array.from({ length: 60 }, (_, i) => makePaymentEvent({ id: `p-${i}` }));
    render(<PaymentsTab paymentEvents={events} />);
    fireEvent.click(screen.getByText('→'));
    expect(screen.getByText('→')).toHaveProperty('disabled', true);
  });

  // ── Truncation Warning ────────────────────────────────────────

  it('shows truncation warning when totalEventCount >= fetchLimit', () => {
    const events = [makePaymentEvent()];
    render(<PaymentsTab paymentEvents={events} totalEventCount={1000} fetchLimit={1000} />);
    expect(screen.getByText(/Some events may not be displayed/)).toBeTruthy();
  });

  it('does not show truncation warning when totalEventCount < fetchLimit', () => {
    const events = [makePaymentEvent()];
    render(<PaymentsTab paymentEvents={events} totalEventCount={500} fetchLimit={1000} />);
    expect(screen.queryByText(/Some events may not be displayed/)).toBeNull();
  });

  it('does not show truncation warning when props not provided', () => {
    const events = [makePaymentEvent()];
    render(<PaymentsTab paymentEvents={events} />);
    expect(screen.queryByText(/Some events may not be displayed/)).toBeNull();
  });

  // ── Exactly page size events ──────────────────────────────────

  it('does not show pagination for exactly 50 events', () => {
    const events = Array.from({ length: 50 }, (_, i) => makePaymentEvent({ id: `p-${i}` }));
    render(<PaymentsTab paymentEvents={events} />);
    expect(screen.queryByText(/Page/)).toBeNull();
  });

  it('shows pagination for 51 events', () => {
    const events = Array.from({ length: 51 }, (_, i) => makePaymentEvent({ id: `p-${i}` }));
    render(<PaymentsTab paymentEvents={events} />);
    expect(screen.getByText(/Page 1 \/ 2/)).toBeTruthy();
    expect(screen.getByText(/51 total/)).toBeTruthy();
  });
});
