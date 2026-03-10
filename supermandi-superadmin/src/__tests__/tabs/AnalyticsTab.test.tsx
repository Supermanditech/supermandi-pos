// SuperAdmin — Test AnalyticsTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnalyticsTab } from '../../tabs/AnalyticsTab';

vi.mock('../../ui/status', () => ({
  isDeviceOnline: vi.fn(() => true),
}));

vi.mock('../../lib/formatters', () => ({
  formatDateTime: vi.fn((v: string) => v || '--'),
  formatDate: vi.fn((v: string) => v || '--'),
  formatCurrency: vi.fn((v: number) => `₹${(v / 100).toFixed(2)}`),
}));

const makeOverviewData = (overrides: Record<string, unknown> = {}) => ({
  range: { from: '2026-01-01', to: '2026-01-31' },
  sales_total: { pos_minor: 10000, consumer_minor: 5000, total_minor: 15000 },
  collections_total_minor: 12000,
  new_products_created_count: 3,
  devices: { online: 5, offline: 2, pending_outbox_total: 10 },
  payment_split_minor: { cash: 5000, upi: 4000, due: 1000 },
  due_outstanding: { total_minor: 3000, buckets: [] },
  profit: null,
  profit_missing_fields: ['purchase data'],
  ...overrides,
});

const makeDevicesData = () => ({
  devices: [{
    device_id: 'd1', store_id: 'store-1', label: 'POS-1', device_type: 'OEM_HANDHELD',
    last_seen_online: '2026-01-01', active: true, pending_outbox_count: 0,
    sales_count: 10, sales_total_minor: 5000, collections_count: 5,
    collections_total_minor: 3000, offline_sales_count: 1, last_sync_at: '2026-01-01',
  }],
  total: 1,
  range: { from: '2026-01-01', to: '2026-01-31' },
});

function createProps(overrides: Partial<Parameters<typeof AnalyticsTab>[0]> = {}) {
  return {
    analyticsStoreId: '',
    setAnalyticsStoreId: vi.fn(),
    analyticsFrom: '2026-01-01',
    setAnalyticsFrom: vi.fn(),
    analyticsTo: '2026-01-31',
    setAnalyticsTo: vi.fn(),
    refreshAnalytics: vi.fn(),
    analyticsTab: 'overview' as const,
    setAnalyticsTab: vi.fn(),
    analyticsLoading: false,
    analyticsError: '',
    overviewData: null,
    analyticsDevices: null,
    analyticsProducts: null,
    analyticsPurchases: null,
    analyticsConsumerSales: null,
    analyticsActivity: null,
    analyticsDues: null,
    productsGroupBy: 'day',
    setProductsGroupBy: vi.fn(),
    ...overrides,
  };
}

describe('AnalyticsTab', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ── Header ──────────────────────────────────────────────────

  it('renders Analytics header', () => {
    render(<AnalyticsTab {...createProps()} />);
    expect(screen.getByText('Analytics')).toBeTruthy();
  });

  it('renders subtitle', () => {
    render(<AnalyticsTab {...createProps()} />);
    expect(screen.getByText(/POS \+ Consumer \+ Purchases/)).toBeTruthy();
  });

  it('renders Live Data badge', () => {
    render(<AnalyticsTab {...createProps()} />);
    expect(screen.getByText('Live Data')).toBeTruthy();
  });

  // ── Filters ─────────────────────────────────────────────────

  it('renders Store ID input', () => {
    render(<AnalyticsTab {...createProps()} />);
    expect(screen.getByLabelText(/Store ID/)).toBeTruthy();
  });

  it('renders From date input', () => {
    render(<AnalyticsTab {...createProps()} />);
    expect(screen.getByLabelText('From')).toBeTruthy();
  });

  it('renders To date input', () => {
    render(<AnalyticsTab {...createProps()} />);
    expect(screen.getByLabelText('To')).toBeTruthy();
  });

  it('renders Refresh button', () => {
    render(<AnalyticsTab {...createProps()} />);
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
  });

  it('calls refreshAnalytics on Refresh click', () => {
    const refresh = vi.fn();
    render(<AnalyticsTab {...createProps({ refreshAnalytics: refresh })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(refresh).toHaveBeenCalledWith('overview');
  });

  it('shows Refreshing... when loading', () => {
    render(<AnalyticsTab {...createProps({ analyticsLoading: true })} />);
    expect(screen.getByText('Refreshing...')).toBeTruthy();
  });

  // ── Error State ─────────────────────────────────────────────

  it('displays error banner with role=alert', () => {
    render(<AnalyticsTab {...createProps({ analyticsError: 'Load failed' })} />);
    expect(screen.getByText('Load failed')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  // ── Loading State ───────────────────────────────────────────

  it('shows loading spinner when analyticsLoading', () => {
    render(<AnalyticsTab {...createProps({ analyticsLoading: true })} />);
    expect(screen.getByText('Loading analytics...')).toBeTruthy();
  });

  // ── Sub-tabs ────────────────────────────────────────────────

  it('renders all sub-tab buttons', () => {
    render(<AnalyticsTab {...createProps()} />);
    expect(screen.getByText('Overview')).toBeTruthy();
    expect(screen.getByText('Devices')).toBeTruthy();
    expect(screen.getByText('Products')).toBeTruthy();
    expect(screen.getByText('Payments & Dues')).toBeTruthy();
    expect(screen.getByText('Purchases')).toBeTruthy();
    expect(screen.getByText('Consumer Sales')).toBeTruthy();
    expect(screen.getByText('Activity Logs')).toBeTruthy();
    expect(screen.getByText('Dues Tracking')).toBeTruthy();
  });

  it('calls setAnalyticsTab on sub-tab click', () => {
    const setTab = vi.fn();
    render(<AnalyticsTab {...createProps({ setAnalyticsTab: setTab })} />);
    fireEvent.click(screen.getByText('Products'));
    expect(setTab).toHaveBeenCalledWith('products');
  });

  it('calls setAnalyticsTab with devices on Devices click', () => {
    const setTab = vi.fn();
    render(<AnalyticsTab {...createProps({ setAnalyticsTab: setTab })} />);
    fireEvent.click(screen.getByText('Devices'));
    expect(setTab).toHaveBeenCalledWith('devices');
  });

  // ── Empty States ────────────────────────────────────────────

  it('shows empty state for overview when no data', () => {
    render(<AnalyticsTab {...createProps({ analyticsTab: 'overview', overviewData: null })} />);
    expect(screen.getByText(/No overview data available/)).toBeTruthy();
  });

  it('shows empty state for devices tab', () => {
    render(<AnalyticsTab {...createProps({ analyticsTab: 'devices', analyticsDevices: null })} />);
    expect(screen.getByText(/No device data available/)).toBeTruthy();
  });

  it('shows empty state for products tab', () => {
    render(<AnalyticsTab {...createProps({ analyticsTab: 'products', analyticsProducts: null })} />);
    expect(screen.getByText(/No product data available/)).toBeTruthy();
  });

  it('shows empty state for purchases tab', () => {
    render(<AnalyticsTab {...createProps({ analyticsTab: 'purchases', analyticsPurchases: null })} />);
    expect(screen.getByText(/No purchase data available/)).toBeTruthy();
  });

  it('shows empty state for consumer tab', () => {
    render(<AnalyticsTab {...createProps({ analyticsTab: 'consumer', analyticsConsumerSales: null })} />);
    expect(screen.getByText(/No consumer sales data available/)).toBeTruthy();
  });

  it('shows empty state for activity tab', () => {
    render(<AnalyticsTab {...createProps({ analyticsTab: 'activity', analyticsActivity: null })} />);
    expect(screen.getByText(/No activity data available/)).toBeTruthy();
  });

  it('shows empty state for dues tab', () => {
    render(<AnalyticsTab {...createProps({ analyticsTab: 'dues', analyticsDues: null })} />);
    expect(screen.getByText(/No dues data available/)).toBeTruthy();
  });

  // ── Overview Data ───────────────────────────────────────────

  it('renders overview sales cards', () => {
    render(<AnalyticsTab {...createProps({ overviewData: makeOverviewData() })} />);
    expect(screen.getByText('Sales Total (POS)')).toBeTruthy();
    expect(screen.getByText('Sales Total (Consumer)')).toBeTruthy();
    expect(screen.getByText('Sales Total (All)')).toBeTruthy();
  });

  it('renders collections total card', () => {
    render(<AnalyticsTab {...createProps({ overviewData: makeOverviewData() })} />);
    expect(screen.getByText('Collections Total')).toBeTruthy();
  });

  it('renders new products count', () => {
    render(<AnalyticsTab {...createProps({ overviewData: makeOverviewData() })} />);
    expect(screen.getByText('New Products (Retailer)')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('renders devices online/offline', () => {
    render(<AnalyticsTab {...createProps({ overviewData: makeOverviewData() })} />);
    expect(screen.getByText('Devices Online / Offline')).toBeTruthy();
    expect(screen.getByText('5 / 2')).toBeTruthy();
  });

  it('renders pending outbox count', () => {
    render(<AnalyticsTab {...createProps({ overviewData: makeOverviewData() })} />);
    expect(screen.getByText('Pending outbox: 10')).toBeTruthy();
  });

  // ── Devices Tab Data ────────────────────────────────────────

  it('renders device label in devices tab', () => {
    render(<AnalyticsTab {...createProps({
      analyticsTab: 'devices',
      analyticsDevices: makeDevicesData(),
    })} />);
    expect(screen.getByText('POS-1')).toBeTruthy();
  });

  it('renders device type in devices tab', () => {
    render(<AnalyticsTab {...createProps({
      analyticsTab: 'devices',
      analyticsDevices: makeDevicesData(),
    })} />);
    expect(screen.getByText('OEM_HANDHELD')).toBeTruthy();
  });
});
