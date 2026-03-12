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

  // ── Filter Interactions ───────────────────────────────────

  it('calls setAnalyticsStoreId on store ID input change', () => {
    const setStoreId = vi.fn();
    render(<AnalyticsTab {...createProps({ setAnalyticsStoreId: setStoreId })} />);
    fireEvent.change(screen.getByLabelText(/Store ID/), { target: { value: 'store-123' } });
    expect(setStoreId).toHaveBeenCalledWith('store-123');
  });

  it('calls setAnalyticsFrom on From date change', () => {
    const setFrom = vi.fn();
    render(<AnalyticsTab {...createProps({ setAnalyticsFrom: setFrom })} />);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-02-01' } });
    expect(setFrom).toHaveBeenCalledWith('2026-02-01');
  });

  it('calls setAnalyticsTo on To date change', () => {
    const setTo = vi.fn();
    render(<AnalyticsTab {...createProps({ setAnalyticsTo: setTo })} />);
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-02-28' } });
    expect(setTo).toHaveBeenCalledWith('2026-02-28');
  });

  it('disables Refresh button when loading', () => {
    render(<AnalyticsTab {...createProps({ analyticsLoading: true })} />);
    const btn = screen.getByText('Refreshing...');
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('calls refreshAnalytics with current tab key on refresh', () => {
    const refresh = vi.fn();
    render(<AnalyticsTab {...createProps({ refreshAnalytics: refresh, analyticsTab: 'devices' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(refresh).toHaveBeenCalledWith('devices');
  });

  // ── Empty state for payments tab ──────────────────────────

  it('shows empty state for payments tab when no data', () => {
    render(<AnalyticsTab {...createProps({ analyticsTab: 'payments', overviewData: null })} />);
    expect(screen.getByText(/No payment data available/)).toBeTruthy();
  });

  // ── Overview Profit Data ──────────────────────────────────

  it('renders profit unavailable message when profit is null', () => {
    render(<AnalyticsTab {...createProps({ overviewData: makeOverviewData({ profit: null, profit_missing_fields: ['purchase data'] }) })} />);
    expect(screen.getByText(/Profit unavailable/)).toBeTruthy();
    expect(screen.getByText(/purchase data/)).toBeTruthy();
  });

  it('renders profit data when profit exists', () => {
    const profit = { gross_profit_minor: 5000, margin_percent: 12, profit_confidence: 'high', missing_cost_items_count: 0 };
    render(<AnalyticsTab {...createProps({ overviewData: makeOverviewData({ profit }) })} />);
    expect(screen.getByText('Profit (Gross)')).toBeTruthy();
    expect(screen.getByText(/Margin: 12%/)).toBeTruthy();
    expect(screen.getByText(/Confidence: high/)).toBeTruthy();
  });

  it('shows missing cost items count when > 0', () => {
    const profit = { gross_profit_minor: 5000, margin_percent: 10, profit_confidence: 'low', missing_cost_items_count: 3 };
    render(<AnalyticsTab {...createProps({ overviewData: makeOverviewData({ profit }) })} />);
    expect(screen.getByText('Missing cost items: 3')).toBeTruthy();
  });

  it('renders payment split values in overview', () => {
    render(<AnalyticsTab {...createProps({ overviewData: makeOverviewData() })} />);
    expect(screen.getByText('Payment Split (Cash / UPI / Due)')).toBeTruthy();
  });

  it('renders due outstanding card in overview', () => {
    render(<AnalyticsTab {...createProps({ overviewData: makeOverviewData() })} />);
    expect(screen.getByText('Due Outstanding')).toBeTruthy();
  });

  // ── Payments Tab ──────────────────────────────────────────

  it('renders payments tab with due aging buckets table', () => {
    const overview = makeOverviewData({
      due_outstanding: { total_minor: 3000, buckets: [{ label: '0-7 days', total_minor: 1000, count: 2 }] },
    });
    render(<AnalyticsTab {...createProps({ analyticsTab: 'payments', overviewData: overview })} />);
    expect(screen.getByText('Due aging buckets')).toBeTruthy();
    expect(screen.getByText('0-7 days')).toBeTruthy();
    expect(screen.getByText('Bucket')).toBeTruthy();
  });

  // ── Devices Tab ───────────────────────────────────────────

  it('renders devices tab table headers', () => {
    render(<AnalyticsTab {...createProps({ analyticsTab: 'devices', analyticsDevices: makeDevicesData() })} />);
    expect(screen.getByText('Label')).toBeTruthy();
    expect(screen.getByText('Type')).toBeTruthy();
    expect(screen.getByText('Pending Outbox')).toBeTruthy();
    expect(screen.getByText('Last Seen')).toBeTruthy();
    expect(screen.getByText('Last Sync')).toBeTruthy();
  });

  it('renders device status as Online / Active', () => {
    render(<AnalyticsTab {...createProps({ analyticsTab: 'devices', analyticsDevices: makeDevicesData() })} />);
    expect(screen.getByText('Online / Active')).toBeTruthy();
  });

  // ── Products Tab ──────────────────────────────────────────

  it('renders products tab with Group By dropdown', () => {
    const products = {
      range: { from: '2026-01-01', to: '2026-01-31' },
      top_products: [{ product_id: 'p1', name: 'Tomato', barcode: '123', category: null, source: 'retailer_created' as const, quantity: 10, total_minor: 5000 }],
      new_products_created_count: 1,
      new_products_created: [{ id: 'np1', name: 'Onion', barcode: '456', created_at: '2026-01-01' }],
      sales_by_group: [],
      group_by: 'day' as const,
      missing_fields: [],
    };
    render(<AnalyticsTab {...createProps({ analyticsTab: 'products', analyticsProducts: products })} />);
    expect(screen.getByLabelText('Group By')).toBeTruthy();
    expect(screen.getByText('Top Products')).toBeTruthy();
    expect(screen.getByText('Tomato')).toBeTruthy();
  });

  it('calls setProductsGroupBy on Group By change', () => {
    const setGroupBy = vi.fn();
    const products = {
      range: { from: '2026-01-01', to: '2026-01-31' },
      top_products: [], new_products_created_count: 0, new_products_created: [],
      sales_by_group: [], group_by: 'day' as const, missing_fields: [],
    };
    render(<AnalyticsTab {...createProps({ analyticsTab: 'products', analyticsProducts: products, setProductsGroupBy: setGroupBy })} />);
    fireEvent.change(screen.getByLabelText('Group By'), { target: { value: 'hour' } });
    expect(setGroupBy).toHaveBeenCalledWith('hour');
  });

  it('renders new products created table', () => {
    const products = {
      range: { from: '2026-01-01', to: '2026-01-31' },
      top_products: [],
      new_products_created_count: 2,
      new_products_created: [
        { id: 'np1', name: 'Onion', barcode: '456', created_at: '2026-01-01' },
        { id: 'np2', name: 'Garlic', barcode: '789', created_at: '' },
      ],
      sales_by_group: [], group_by: 'day' as const, missing_fields: [],
    };
    render(<AnalyticsTab {...createProps({ analyticsTab: 'products', analyticsProducts: products })} />);
    expect(screen.getByText('New Products (Retailer)')).toBeTruthy();
    expect(screen.getByText('Count: 2')).toBeTruthy();
    expect(screen.getByText('Onion')).toBeTruthy();
    expect(screen.getByText('Garlic')).toBeTruthy();
  });

  // ── Purchases Tab ─────────────────────────────────────────

  it('renders purchases tab with vendor breakdown', () => {
    const purchases = {
      range: { from: '2026-01-01', to: '2026-01-31' },
      total_minor: 20000,
      vendor_breakdown: [{ supplier: 'FarmFresh', total_minor: 15000 }],
      sku_cost_summary: [{ product_id: 'p1' as string | null, sku: 'SKU-1' as string | null, quantity: 5, avg_cost_minor: 200, last_cost_minor: 250 as number | null }],
      stock_in_breakdown: null,
    };
    render(<AnalyticsTab {...createProps({ analyticsTab: 'purchases', analyticsPurchases: purchases })} />);
    expect(screen.getByText('Purchases Total')).toBeTruthy();
    expect(screen.getByText('Vendor Breakdown')).toBeTruthy();
    expect(screen.getByText('FarmFresh')).toBeTruthy();
    expect(screen.getByText('SKU Cost Summary')).toBeTruthy();
  });

  it('renders stock-in breakdown when data exists', () => {
    const purchases = {
      range: { from: '2026-01-01', to: '2026-01-31' },
      total_minor: 20000,
      vendor_breakdown: [],
      sku_cost_summary: [],
      stock_in_breakdown: {
        total_entries: 3,
        total_amount_minor: 10000,
        by_type: [{
          type: 'verified' as const,
          count: 2,
          total_minor: 7000,
          suppliers: [{ name: 'Supplier A', gstin: 'GSTIN123', count: 2, total_minor: 7000 }],
        }],
      },
    };
    render(<AnalyticsTab {...createProps({ analyticsTab: 'purchases', analyticsPurchases: purchases })} />);
    expect(screen.getByText(/Stock-In Breakdown/)).toBeTruthy();
    expect(screen.getByText('Verified')).toBeTruthy();
    expect(screen.getByText('Supplier A')).toBeTruthy();
    expect(screen.getByText('GSTIN123')).toBeTruthy();
  });

  // ── Consumer Sales Tab ────────────────────────────────────

  it('renders consumer sales tab with payment split and status counts', () => {
    const consumerSales = {
      range: { from: '2026-01-01', to: '2026-01-31' },
      total_minor: 8000,
      payment_split_minor: { cash: 3000, upi: 4000, due: 1000 },
      status_counts: [{ status: 'completed', count: 10 }, { status: 'pending', count: 2 }],
    };
    render(<AnalyticsTab {...createProps({ analyticsTab: 'consumer', analyticsConsumerSales: consumerSales })} />);
    expect(screen.getByText('Consumer Sales Total')).toBeTruthy();
    expect(screen.getByText('Order Status')).toBeTruthy();
    expect(screen.getByText('completed')).toBeTruthy();
    expect(screen.getByText('pending')).toBeTruthy();
  });

  // ── Activity Tab ──────────────────────────────────────────

  it('renders activity logs tab with buckets', () => {
    const activity = {
      range: { from: '2026-01-01T00:00:00Z', to: '2026-01-31T00:00:00Z' },
      groupBy: 'day',
      buckets: [{ bucket: '2026-01-15T00:00:00Z', scans: 50, sales: 10, collections: 5, new_products_created: 2, offline_events_synced: 3 }],
    };
    render(<AnalyticsTab {...createProps({ analyticsTab: 'activity', analyticsActivity: activity })} />);
    const activityHeaders = screen.getAllByText('Activity Logs');
    expect(activityHeaders.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Time Bucket')).toBeTruthy();
    expect(screen.getByText('Scans')).toBeTruthy();
    expect(screen.getByText('50')).toBeTruthy();
  });

  it('shows empty activity message when no buckets', () => {
    const activity = {
      range: { from: '2026-01-01T00:00:00Z', to: '2026-01-31T00:00:00Z' },
      groupBy: 'day',
      buckets: [],
    };
    render(<AnalyticsTab {...createProps({ analyticsTab: 'activity', analyticsActivity: activity })} />);
    expect(screen.getByText('No activity in this period.')).toBeTruthy();
  });

  // ── Dues Tab ──────────────────────────────────────────────

  it('renders dues tracking tab with aging cards', () => {
    const dues = {
      range: { from: '2026-01-01', to: '2026-01-31' },
      outstanding_total_minor: 5000,
      aging: { d0_1: 1000, d2_7: 2000, d8_30: 1500, d30_plus: 500 },
      total: 4,
      dues: [{ sale_id: 'sale-12345678-abcd', customer_name: 'Raju', amount_minor: 1500, created_at: '2026-01-10', age_days: 5 }],
    };
    render(<AnalyticsTab {...createProps({ analyticsTab: 'dues', analyticsDues: dues })} />);
    expect(screen.getByText('Outstanding Total')).toBeTruthy();
    expect(screen.getByText('0-1 Days')).toBeTruthy();
    expect(screen.getByText('2-7 Days')).toBeTruthy();
    expect(screen.getByText('8-30 Days')).toBeTruthy();
    expect(screen.getByText('30+ Days')).toBeTruthy();
    expect(screen.getByText('Raju')).toBeTruthy();
    expect(screen.getByText('sale-123')).toBeTruthy(); // first 8 chars
  });

  it('shows empty dues message when no dues', () => {
    const dues = {
      range: { from: '2026-01-01', to: '2026-01-31' },
      outstanding_total_minor: 0,
      aging: { d0_1: 0, d2_7: 0, d8_30: 0, d30_plus: 0 },
      total: 0,
      dues: [],
    };
    render(<AnalyticsTab {...createProps({ analyticsTab: 'dues', analyticsDues: dues })} />);
    expect(screen.getByText('No outstanding dues.')).toBeTruthy();
  });

  it('renders dues table headers', () => {
    const dues = {
      range: { from: '2026-01-01', to: '2026-01-31' },
      outstanding_total_minor: 1000,
      aging: { d0_1: 1000, d2_7: 0, d8_30: 0, d30_plus: 0 },
      total: 1,
      dues: [{ sale_id: 'sale-abcdefgh', customer_name: null, amount_minor: 1000, created_at: '2026-01-01', age_days: 0 }],
    };
    render(<AnalyticsTab {...createProps({ analyticsTab: 'dues', analyticsDues: dues })} />);
    expect(screen.getByText('Sale ID')).toBeTruthy();
    expect(screen.getByText('Customer')).toBeTruthy();
    expect(screen.getByText('Amount')).toBeTruthy();
    expect(screen.getByText('Age (Days)')).toBeTruthy();
  });

  // ── Sub-tab active class ──────────────────────────────────

  it('applies active class to current tab', () => {
    render(<AnalyticsTab {...createProps({ analyticsTab: 'devices' })} />);
    const devicesBtn = screen.getByText('Devices');
    expect(devicesBtn.className).toContain('tabActive');
    const overviewBtn = screen.getByText('Overview');
    expect(overviewBtn.className).not.toContain('tabActive');
  });

  // ── Clicks all remaining sub-tabs ─────────────────────────

  it('calls setAnalyticsTab with consumer on Consumer Sales click', () => {
    const setTab = vi.fn();
    render(<AnalyticsTab {...createProps({ setAnalyticsTab: setTab })} />);
    fireEvent.click(screen.getByText('Consumer Sales'));
    expect(setTab).toHaveBeenCalledWith('consumer');
  });

  it('calls setAnalyticsTab with activity on Activity Logs click', () => {
    const setTab = vi.fn();
    render(<AnalyticsTab {...createProps({ setAnalyticsTab: setTab })} />);
    fireEvent.click(screen.getByText('Activity Logs'));
    expect(setTab).toHaveBeenCalledWith('activity');
  });

  it('calls setAnalyticsTab with dues on Dues Tracking click', () => {
    const setTab = vi.fn();
    render(<AnalyticsTab {...createProps({ setAnalyticsTab: setTab })} />);
    fireEvent.click(screen.getByText('Dues Tracking'));
    expect(setTab).toHaveBeenCalledWith('dues');
  });
});
