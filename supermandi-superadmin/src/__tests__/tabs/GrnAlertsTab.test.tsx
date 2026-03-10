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

  // ── Header ──────────────────────────────────────────────────

  it('renders header', () => {
    render(<GrnAlertsTab {...createProps()} />);
    expect(screen.getByText('GRN Excess Receipt Alerts')).toBeTruthy();
  });

  it('renders subtitle description', () => {
    render(<GrnAlertsTab {...createProps()} />);
    expect(screen.getByText('Items received in quantities exceeding purchase order amounts')).toBeTruthy();
  });

  // ── Empty State ─────────────────────────────────────────────

  it('shows empty state', () => {
    render(<GrnAlertsTab {...createProps()} />);
    expect(screen.getByText('No GRN excess alerts found.')).toBeTruthy();
  });

  it('does not show empty state when alerts exist', () => {
    render(<GrnAlertsTab {...createProps({ grnAlerts: [makeAlert()], grnAlertsTotal: 1 })} />);
    expect(screen.queryByText('No GRN excess alerts found.')).toBeNull();
  });

  // ── Error State ─────────────────────────────────────────────

  it('shows error', () => {
    render(<GrnAlertsTab {...createProps({ grnAlertsError: 'Failed' })} />);
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it('shows error with role=alert', () => {
    render(<GrnAlertsTab {...createProps({ grnAlertsError: 'Server error' })} />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('does not show error banner when no error', () => {
    render(<GrnAlertsTab {...createProps()} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // ── Loading State ───────────────────────────────────────────

  it('shows Loading... on button when loading', () => {
    render(<GrnAlertsTab {...createProps({ grnAlertsLoading: true })} />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('shows Refresh when not loading', () => {
    render(<GrnAlertsTab {...createProps({ grnAlertsLoading: false })} />);
    expect(screen.getByText('Refresh')).toBeTruthy();
  });

  it('disables refresh button when loading', () => {
    render(<GrnAlertsTab {...createProps({ grnAlertsLoading: true })} />);
    expect((screen.getByText('Loading...') as HTMLButtonElement).disabled).toBe(true);
  });

  // ── Count Display ───────────────────────────────────────────

  it('shows total count', () => {
    render(<GrnAlertsTab {...createProps({ grnAlertsTotal: 5 })} />);
    expect(screen.getByText('5 alerts total')).toBeTruthy();
  });

  it('shows singular alert text for count of 1', () => {
    render(<GrnAlertsTab {...createProps({ grnAlertsTotal: 1 })} />);
    expect(screen.getByText('1 alert total')).toBeTruthy();
  });

  it('shows open count badge', () => {
    render(<GrnAlertsTab {...createProps({ grnAlertsTotal: 10, grnAlertsOpenCount: 3 })} />);
    expect(screen.getByText('(3 open)')).toBeTruthy();
  });

  it('does not show open count badge when zero', () => {
    render(<GrnAlertsTab {...createProps({ grnAlertsTotal: 5, grnAlertsOpenCount: 0 })} />);
    expect(screen.queryByText(/open\)/)).toBeNull();
  });

  // ── Filter Dropdown ─────────────────────────────────────────

  it('renders status filter with All Statuses option', () => {
    render(<GrnAlertsTab {...createProps()} />);
    const select = screen.getByDisplayValue('All Statuses');
    expect(select).toBeTruthy();
  });

  it('calls setGrnAlertsFilter on filter change', () => {
    const setFilter = vi.fn();
    const setOffset = vi.fn();
    render(<GrnAlertsTab {...createProps({ setGrnAlertsFilter: setFilter, setGrnAlertsOffset: setOffset })} />);
    fireEvent.change(screen.getByDisplayValue('All Statuses'), { target: { value: 'OPEN' } });
    expect(setFilter).toHaveBeenCalledWith('OPEN');
  });

  it('resets offset to 0 on filter change', () => {
    const setOffset = vi.fn();
    render(<GrnAlertsTab {...createProps({ setGrnAlertsOffset: setOffset })} />);
    fireEvent.change(screen.getByDisplayValue('All Statuses'), { target: { value: 'ACKNOWLEDGED' } });
    expect(setOffset).toHaveBeenCalledWith(0);
  });

  // ── Table ───────────────────────────────────────────────────

  it('renders table column headers', () => {
    const alerts = [makeAlert()];
    render(<GrnAlertsTab {...createProps({ grnAlerts: alerts, grnAlertsTotal: 1 })} />);
    expect(screen.getByText('Store')).toBeTruthy();
    expect(screen.getByText('Order #')).toBeTruthy();
    expect(screen.getByText('Product')).toBeTruthy();
    expect(screen.getByText('Ordered')).toBeTruthy();
    expect(screen.getByText('Received')).toBeTruthy();
    expect(screen.getByText('Excess')).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.getByText('Date')).toBeTruthy();
    expect(screen.getByText('Actions')).toBeTruthy();
  });

  it('renders alert rows', () => {
    const alerts = [makeAlert()];
    render(<GrnAlertsTab {...createProps({ grnAlerts: alerts, grnAlertsTotal: 1 })} />);
    expect(screen.getByText('Rice 5kg')).toBeTruthy();
    expect(screen.getByText('Test Store')).toBeTruthy();
    expect(screen.getByText('+5')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
  });

  it('renders order number in row', () => {
    const alerts = [makeAlert({ order_number: 'ORD-555' })];
    render(<GrnAlertsTab {...createProps({ grnAlerts: alerts, grnAlertsTotal: 1 })} />);
    expect(screen.getByText('ORD-555')).toBeTruthy();
  });

  it('renders ordered and received quantities', () => {
    const alerts = [makeAlert({ ordered_qty: 20, total_received_qty: 30 })];
    render(<GrnAlertsTab {...createProps({ grnAlerts: alerts, grnAlertsTotal: 1 })} />);
    expect(screen.getByText('20')).toBeTruthy();
    expect(screen.getByText('30')).toBeTruthy();
  });

  it('renders status badge', () => {
    const alerts = [makeAlert({ status: 'OPEN' })];
    render(<GrnAlertsTab {...createProps({ grnAlerts: alerts, grnAlertsTotal: 1 })} />);
    expect(screen.getByText('OPEN')).toBeTruthy();
  });

  it('renders multiple alert rows', () => {
    const alerts = [
      makeAlert({ id: 'a1', product_name: 'Rice 5kg', excess_qty: 5 }),
      makeAlert({ id: 'a2', product_name: 'Wheat 10kg', excess_qty: 8 }),
    ];
    render(<GrnAlertsTab {...createProps({ grnAlerts: alerts, grnAlertsTotal: 2 })} />);
    expect(screen.getByText('Rice 5kg')).toBeTruthy();
    expect(screen.getByText('Wheat 10kg')).toBeTruthy();
    expect(screen.getByText('+8')).toBeTruthy();
  });

  it('renders formatted timestamp', () => {
    const alerts = [makeAlert({ created_at: '2026-03-10T10:00:00Z' })];
    render(<GrnAlertsTab {...createProps({ grnAlerts: alerts, grnAlertsTotal: 1 })} />);
    expect(screen.getByText('2026-03-10T10:00:00Z')).toBeTruthy();
  });

  it('renders product name with title tooltip', () => {
    const alerts = [makeAlert({ product_name: 'Basmati Rice' })];
    render(<GrnAlertsTab {...createProps({ grnAlerts: alerts, grnAlertsTotal: 1 })} />);
    expect(screen.getByTitle('Basmati Rice')).toBeTruthy();
  });

  it('falls back to store_id slice when store_name is empty', () => {
    const alerts = [makeAlert({ store_name: '', store_id: 'abcdefghij' })];
    render(<GrnAlertsTab {...createProps({ grnAlerts: alerts, grnAlertsTotal: 1 })} />);
    expect(screen.getByText('abcdefgh')).toBeTruthy();
  });

  // ── Action Buttons ──────────────────────────────────────────

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

  it('disables action buttons when action is loading for that alert', () => {
    const alerts = [makeAlert({ id: 'alert-x' })];
    render(<GrnAlertsTab {...createProps({ grnAlerts: alerts, grnAlertsTotal: 1, grnAlertActionLoading: 'alert-x' })} />);
    const updatingBtns = screen.getAllByText('Updating...');
    expect(updatingBtns.length).toBe(2);
    expect((updatingBtns[0] as HTMLButtonElement).disabled).toBe(true);
    expect((updatingBtns[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not disable action buttons for other alerts while one is loading', () => {
    const alerts = [makeAlert({ id: 'alert-y' })];
    render(<GrnAlertsTab {...createProps({ grnAlerts: alerts, grnAlertsTotal: 1, grnAlertActionLoading: 'other-alert' })} />);
    expect((screen.getByText('Acknowledge') as HTMLButtonElement).disabled).toBe(false);
  });

  it('does not show action buttons for non-OPEN alerts', () => {
    const alerts = [makeAlert({ status: 'ACKNOWLEDGED', acknowledged_at: '2026-01-02' })];
    render(<GrnAlertsTab {...createProps({ grnAlerts: alerts, grnAlertsTotal: 1 })} />);
    expect(screen.queryByText('Acknowledge')).toBeNull();
    expect(screen.queryByText('Dismiss')).toBeNull();
  });

  it('shows acknowledged_at timestamp for non-OPEN alerts', () => {
    const alerts = [makeAlert({ status: 'ACKNOWLEDGED', acknowledged_at: '2026-02-15T12:00:00Z' })];
    render(<GrnAlertsTab {...createProps({ grnAlerts: alerts, grnAlertsTotal: 1 })} />);
    expect(screen.getByText('2026-02-15T12:00:00Z')).toBeTruthy();
  });

  it('does not show acknowledged_at for DISMISSED without timestamp', () => {
    const alerts = [makeAlert({ status: 'DISMISSED', acknowledged_at: null })];
    render(<GrnAlertsTab {...createProps({ grnAlerts: alerts, grnAlertsTotal: 1 })} />);
    expect(screen.queryByText('Acknowledge')).toBeNull();
  });

  // ── Refresh ─────────────────────────────────────────────────

  it('calls refreshGrnAlerts on button click', () => {
    const refresh = vi.fn();
    render(<GrnAlertsTab {...createProps({ refreshGrnAlerts: refresh })} />);
    fireEvent.click(screen.getByText('Refresh'));
    expect(refresh).toHaveBeenCalled();
  });

  // ── Pagination ──────────────────────────────────────────────

  it('shows pagination when total exceeds 50', () => {
    render(<GrnAlertsTab {...createProps({ grnAlertsTotal: 60, grnAlertsOffset: 0 })} />);
    expect(screen.getByText('1–50 of 60')).toBeTruthy();
  });

  it('does not show pagination for 50 or fewer', () => {
    render(<GrnAlertsTab {...createProps({ grnAlertsTotal: 50, grnAlertsOffset: 0 })} />);
    expect(screen.queryByText(/of 50/)).toBeNull();
  });

  it('disables Previous on first page', () => {
    render(<GrnAlertsTab {...createProps({ grnAlertsTotal: 100, grnAlertsOffset: 0 })} />);
    expect((screen.getByText('Previous') as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables Previous on subsequent pages', () => {
    render(<GrnAlertsTab {...createProps({ grnAlertsTotal: 100, grnAlertsOffset: 50 })} />);
    expect((screen.getByText('Previous') as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables Next on last page', () => {
    render(<GrnAlertsTab {...createProps({ grnAlertsTotal: 100, grnAlertsOffset: 50 })} />);
    expect((screen.getByText('Next') as HTMLButtonElement).disabled).toBe(true);
  });

  it('calls setGrnAlertsOffset on Next click', () => {
    const setOffset = vi.fn();
    render(<GrnAlertsTab {...createProps({ grnAlertsTotal: 100, grnAlertsOffset: 0, setGrnAlertsOffset: setOffset })} />);
    fireEvent.click(screen.getByText('Next'));
    expect(setOffset).toHaveBeenCalledWith(50);
  });

  it('calls setGrnAlertsOffset on Previous click', () => {
    const setOffset = vi.fn();
    render(<GrnAlertsTab {...createProps({ grnAlertsTotal: 100, grnAlertsOffset: 50, setGrnAlertsOffset: setOffset })} />);
    fireEvent.click(screen.getByText('Previous'));
    expect(setOffset).toHaveBeenCalledWith(0);
  });
});
