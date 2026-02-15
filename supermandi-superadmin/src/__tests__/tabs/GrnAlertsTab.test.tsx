// SuperAdmin — Test GrnAlertsTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GrnAlertsTab } from '../../tabs/GrnAlertsTab';
import type { GrnExcessAlert } from '../../api/grnAlerts';

vi.mock('../../lib/formatters', () => ({
  formatDateTime: vi.fn((v: string) => v || '--'),
}));

const makeAlert = (overrides: Partial<GrnExcessAlert> = {}): GrnExcessAlert => ({
  id: 'alert-1',
  store_id: 's1',
  store_name: 'Test Store',
  purchase_order_id: 'po-1',
  order_number: 'ORD-001',
  order_item_id: 'oi-1',
  receive_id: 'r-1',
  product_name: 'Rice 5kg',
  ordered_qty: 10,
  total_received_qty: 15,
  excess_qty: 5,
  excess_pct: 50,
  status: 'OPEN',
  acknowledged_by: null,
  acknowledged_at: null,
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

function createProps(overrides: Partial<Parameters<typeof GrnAlertsTab>[0]> = {}) {
  return {
    grnAlerts: [],
    grnAlertsLoading: false,
    grnAlertsError: '',
    grnAlertsFilter: '' as const,
    grnAlertsTotal: 0,
    grnAlertsOpenCount: 0,
    grnAlertsOffset: 0,
    grnAlertActionLoading: null,
    setGrnAlertsFilter: vi.fn(),
    setGrnAlertsOffset: vi.fn(),
    refreshGrnAlerts: vi.fn(),
    handleGrnAlertAction: vi.fn(),
    ...overrides,
  };
}

describe('GrnAlertsTab', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders header', () => {
    render(<GrnAlertsTab {...createProps()} />);
    expect(screen.getByText('GRN Excess Receipt Alerts')).toBeTruthy();
  });

  it('shows empty state', () => {
    render(<GrnAlertsTab {...createProps()} />);
    expect(screen.getByText('No GRN excess alerts found.')).toBeTruthy();
  });

  it('shows error', () => {
    render(<GrnAlertsTab {...createProps({ grnAlertsError: 'Failed' })} />);
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it('shows total count', () => {
    render(<GrnAlertsTab {...createProps({ grnAlertsTotal: 5 })} />);
    expect(screen.getByText('5 alerts total')).toBeTruthy();
  });

  it('shows open count badge', () => {
    render(<GrnAlertsTab {...createProps({ grnAlertsTotal: 10, grnAlertsOpenCount: 3 })} />);
    expect(screen.getByText('(3 open)')).toBeTruthy();
  });

  it('renders alert rows', () => {
    const alerts = [makeAlert()];
    render(<GrnAlertsTab {...createProps({ grnAlerts: alerts, grnAlertsTotal: 1 })} />);
    expect(screen.getByText('Rice 5kg')).toBeTruthy();
    expect(screen.getByText('Test Store')).toBeTruthy();
    expect(screen.getByText('+5')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
  });

  it('shows action buttons for OPEN alerts', () => {
    const alerts = [makeAlert()];
    render(<GrnAlertsTab {...createProps({ grnAlerts: alerts, grnAlertsTotal: 1 })} />);
    expect(screen.getByText('Acknowledge')).toBeTruthy();
    expect(screen.getByText('Dismiss')).toBeTruthy();
  });

  it('calls handleGrnAlertAction on Acknowledge click', () => {
    const handler = vi.fn();
    const alerts = [makeAlert()];
    render(<GrnAlertsTab {...createProps({ grnAlerts: alerts, grnAlertsTotal: 1, handleGrnAlertAction: handler })} />);
    fireEvent.click(screen.getByText('Acknowledge'));
    expect(handler).toHaveBeenCalledWith('alert-1', 'ACKNOWLEDGED');
  });

  it('calls handleGrnAlertAction on Dismiss click', () => {
    const handler = vi.fn();
    const alerts = [makeAlert()];
    render(<GrnAlertsTab {...createProps({ grnAlerts: alerts, grnAlertsTotal: 1, handleGrnAlertAction: handler })} />);
    fireEvent.click(screen.getByText('Dismiss'));
    expect(handler).toHaveBeenCalledWith('alert-1', 'DISMISSED');
  });

  it('does not show action buttons for non-OPEN alerts', () => {
    const alerts = [makeAlert({ status: 'ACKNOWLEDGED', acknowledged_at: '2026-01-02' })];
    render(<GrnAlertsTab {...createProps({ grnAlerts: alerts, grnAlertsTotal: 1 })} />);
    expect(screen.queryByText('Acknowledge')).toBeNull();
    expect(screen.queryByText('Dismiss')).toBeNull();
  });

  it('calls refreshGrnAlerts on button click', () => {
    const refresh = vi.fn();
    render(<GrnAlertsTab {...createProps({ refreshGrnAlerts: refresh })} />);
    fireEvent.click(screen.getByText('Refresh'));
    expect(refresh).toHaveBeenCalled();
  });
});
