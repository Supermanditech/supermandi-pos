// SuperAdmin — Test PaymentsTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('renders header', () => {
    render(<PaymentsTab paymentEvents={[]} />);
    expect(screen.getByText('Payments')).toBeTruthy();
  });

  it('shows empty state', () => {
    render(<PaymentsTab paymentEvents={[]} />);
    expect(screen.getByText('No payment events found for the current filters.')).toBeTruthy();
  });

  it('renders payment event rows', () => {
    const events = [makePaymentEvent()];
    render(<PaymentsTab paymentEvents={events} />);
    expect(screen.getByText('d1')).toBeTruthy();
    expect(screen.getByText('s1')).toBeTruthy();
    expect(screen.getByText('PAYMENT_COMPLETED')).toBeTruthy();
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

  it('shows table headers', () => {
    const events = [makePaymentEvent()];
    render(<PaymentsTab paymentEvents={events} />);
    expect(screen.getByText('Timestamp')).toBeTruthy();
    expect(screen.getByText('Device ID')).toBeTruthy();
    expect(screen.getByText('Store ID')).toBeTruthy();
    expect(screen.getByText('Event Type')).toBeTruthy();
    expect(screen.getByText('Payload')).toBeTruthy();
  });
});
