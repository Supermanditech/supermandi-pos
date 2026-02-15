// SuperAdmin — Test AnalyticsTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnalyticsTab } from '../../tabs/AnalyticsTab';

vi.mock('../../ui/status', () => ({
  isDeviceOnline: vi.fn(() => true),
}));

vi.mock('../../lib/formatters', () => ({
  formatDateTime: vi.fn((v: string) => v || '--'),
  formatCurrency: vi.fn((v: number) => `$${(v / 100).toFixed(2)}`),
}));

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

  it('renders analytics header', () => {
    render(<AnalyticsTab {...createProps()} />);
    expect(screen.getByText('Analytics')).toBeTruthy();
  });

  it('shows refresh button and calls refreshAnalytics on click', () => {
    const refresh = vi.fn();
    render(<AnalyticsTab {...createProps({ refreshAnalytics: refresh })} />);
    fireEvent.click(screen.getByText('Refresh'));
    expect(refresh).toHaveBeenCalledWith('overview');
  });

  it('shows loading state on refresh button', () => {
    render(<AnalyticsTab {...createProps({ analyticsLoading: true })} />);
    expect(screen.getByText('Refreshing...')).toBeTruthy();
  });

  it('displays error banner', () => {
    render(<AnalyticsTab {...createProps({ analyticsError: 'Load failed' })} />);
    expect(screen.getByText('Load failed')).toBeTruthy();
  });

  it('renders sub-tab buttons', () => {
    render(<AnalyticsTab {...createProps()} />);
    expect(screen.getByText('Overview')).toBeTruthy();
    expect(screen.getByText('Devices')).toBeTruthy();
    expect(screen.getByText('Products')).toBeTruthy();
    expect(screen.getByText('Consumer Sales')).toBeTruthy();
  });

  it('calls setAnalyticsTab on sub-tab click', () => {
    const setTab = vi.fn();
    render(<AnalyticsTab {...createProps({ setAnalyticsTab: setTab })} />);
    fireEvent.click(screen.getByText('Products'));
    expect(setTab).toHaveBeenCalledWith('products');
  });

  it('renders overview data when provided', () => {
    const overview = {
      sales_total: { pos_minor: 10000, consumer_minor: 5000, total_minor: 15000 },
      collections_total_minor: 12000,
      new_products_created_count: 3,
      devices: { online: 5, offline: 2, pending_outbox_total: 10 },
      payment_split_minor: { cash: 5000, upi: 4000, due: 1000 },
      due_outstanding: { total_minor: 3000, buckets: [] },
      profit: null,
      profit_missing_fields: ['purchase data'],
    };
    render(<AnalyticsTab {...createProps({ overviewData: overview })} />);
    expect(screen.getByText('Sales Total (POS)')).toBeTruthy();
    expect(screen.getByText('Sales Total (Consumer)')).toBeTruthy();
  });

  it('renders devices tab data', () => {
    const devicesData = {
      devices: [{
        device_id: 'd1', label: 'POS-1', device_type: 'OEM_HANDHELD', last_seen_online: '2026-01-01',
        active: true, pending_outbox_count: 0, sales_count: 10, sales_total_minor: 5000,
        collections_count: 5, collections_total_minor: 3000, offline_sales_count: 1, last_sync_at: '2026-01-01',
      }],
    };
    render(<AnalyticsTab {...createProps({ analyticsTab: 'devices', analyticsDevices: devicesData })} />);
    expect(screen.getByText('POS-1')).toBeTruthy();
  });
});
