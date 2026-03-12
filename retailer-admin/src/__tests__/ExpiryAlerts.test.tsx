// SCALE-C2: Expiry Alerts section on InventoryPage — UI tests
// Verifies: summary cards, table, badge colors, empty state, daysAhead toggle

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import InventoryPage from '../pages/InventoryPage';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ accessToken: 'test-token' }),
}));

vi.mock('../components/Breadcrumb', () => ({
  default: () => <nav data-testid="breadcrumb">Breadcrumb</nav>,
}));

vi.mock('../components/EmptyState', () => ({
  default: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  ),
}));

vi.mock('../hooks/useUrlState', () => ({
  useUrlState: (_key: string, defaultValue: string = '') => {
    const { useState } = require('react');
    return useState(defaultValue);
  },
}));

vi.mock('../lib/formatters', () => ({
  formatDateTime: (d: string) => new Date(d).toLocaleDateString(),
}));

vi.mock('lucide-react', () => ({
  ClipboardList: () => <span>ClipboardIcon</span>,
  RefreshCw: (props: { style?: object }) => <span style={props.style}>RefreshIcon</span>,
  AlertTriangle: () => <span>AlertTriangleIcon</span>,
}));

vi.mock('../lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn() },
}));

const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeLedgerResponse() {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        success: true,
        data: [],
        totals: { totalSkus: 0, totalEntries: 0, todaysMovements: 0 },
        pagination: { total: 0, limit: 100, offset: 0, hasMore: false },
      }),
  };
}

function makeExpiryResponse(
  expiring: Array<{
    id: string;
    productId: string;
    name: string;
    barcode: string;
    quantity: number;
    expiryDate: string;
    daysRemaining: number;
    batchNumber: string | null;
    severity: 'expired' | 'critical' | 'warning';
  }> = []
) {
  const counts = expiring.reduce(
    (acc, p) => {
      acc[p.severity] = (acc[p.severity] || 0) + 1;
      return acc;
    },
    { expired: 0, critical: 0, warning: 0 } as Record<string, number>
  );
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ expiring, counts }),
  };
}

function makeExpiryProduct(overrides: Partial<{
  id: string;
  productId: string;
  name: string;
  barcode: string;
  quantity: number;
  expiryDate: string;
  daysRemaining: number;
  batchNumber: string | null;
  severity: 'expired' | 'critical' | 'warning';
}> = {}) {
  return {
    id: 'sp-001',
    productId: 'p-001',
    name: 'Milk',
    barcode: '1234567890',
    quantity: 10,
    expiryDate: '2026-04-15',
    daysRemaining: 34,
    batchNumber: 'B001',
    severity: 'warning' as const,
    ...overrides,
  };
}

function renderInventoryPage() {
  return render(
    <MemoryRouter initialEntries={['/s/SU260305-003/inventory']}>
      <Routes>
        <Route path="/s/:storeCode/inventory" element={<InventoryPage />} />
      </Routes>
    </MemoryRouter>
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('SCALE-C2: ExpiryAlerts section on InventoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders expiry alerts section', async () => {
    mockAuthFetch.mockImplementation((url: string) => {
      if (url.includes('/inventory/expiring')) return makeExpiryResponse();
      return makeLedgerResponse();
    });

    renderInventoryPage();
    await waitFor(() => {
      expect(screen.getByTestId('expiry-alerts-section')).toBeTruthy();
    });
  });

  it('shows summary cards with critical and warning counts', async () => {
    const expiring = [
      makeExpiryProduct({ id: '1', severity: 'critical', daysRemaining: 10 }),
      makeExpiryProduct({ id: '2', severity: 'critical', daysRemaining: 25 }),
      makeExpiryProduct({ id: '3', severity: 'critical', daysRemaining: 5 }),
      makeExpiryProduct({ id: '4', severity: 'warning', daysRemaining: 60 }),
      makeExpiryProduct({ id: '5', severity: 'warning', daysRemaining: 80 }),
    ];

    mockAuthFetch.mockImplementation((url: string) => {
      if (url.includes('/inventory/expiring')) return makeExpiryResponse(expiring);
      return makeLedgerResponse();
    });

    renderInventoryPage();

    // Wait for data to load and verify counts render correctly
    await waitFor(() => {
      const criticalCard = screen.getByTestId('expiry-card-critical');
      expect(criticalCard.textContent).toContain('3');
    });

    await waitFor(() => {
      const warningCard = screen.getByTestId('expiry-card-warning');
      expect(warningCard.textContent).toContain('2');
    });
  });

  it('renders expiry table with product data', async () => {
    const expiring = [
      makeExpiryProduct({ name: 'Parle-G', batchNumber: 'B001', expiryDate: '2026-04-15', daysRemaining: 34 }),
    ];

    mockAuthFetch.mockImplementation((url: string) => {
      if (url.includes('/inventory/expiring')) return makeExpiryResponse(expiring);
      return makeLedgerResponse();
    });

    renderInventoryPage();

    await waitFor(() => {
      expect(screen.getByTestId('expiry-table')).toBeTruthy();
      expect(screen.getByTestId('expiry-product-name').textContent).toBe('Parle-G');
    });

    expect(screen.getByTestId('expiry-batch').textContent).toBe('B001');
    expect(screen.getByTestId('expiry-date').textContent).toBe('2026-04-15');
  });

  it('shows red days-remaining badge when daysRemaining <= 30 (critical)', async () => {
    const expiring = [
      makeExpiryProduct({ id: '1', daysRemaining: 15, severity: 'critical' }),
    ];

    mockAuthFetch.mockImplementation((url: string) => {
      if (url.includes('/inventory/expiring')) return makeExpiryResponse(expiring);
      return makeLedgerResponse();
    });

    renderInventoryPage();

    await waitFor(() => {
      const badge = screen.getByTestId('expiry-days-badge');
      const style = badge.getAttribute('style') || '';
      expect(style).toContain('var(--danger)');
    });
  });

  it('shows orange days-remaining badge when daysRemaining 31-90 (warning)', async () => {
    const expiring = [
      makeExpiryProduct({ id: '1', daysRemaining: 60, severity: 'warning' }),
    ];

    mockAuthFetch.mockImplementation((url: string) => {
      if (url.includes('/inventory/expiring')) return makeExpiryResponse(expiring);
      return makeLedgerResponse();
    });

    renderInventoryPage();

    await waitFor(() => {
      const badge = screen.getByTestId('expiry-days-badge');
      const style = badge.getAttribute('style') || '';
      expect(style).toContain('var(--warning)');
    });
  });

  it('shows empty state when no expiring products', async () => {
    mockAuthFetch.mockImplementation((url: string) => {
      if (url.includes('/inventory/expiring')) return makeExpiryResponse([]);
      return makeLedgerResponse();
    });

    renderInventoryPage();

    await waitFor(() => {
      expect(screen.getByTestId('expiry-empty')).toBeTruthy();
      expect(screen.getByText('No expiring products')).toBeTruthy();
    });
  });

  it('shows daysAhead toggle buttons (30, 90, 180)', async () => {
    mockAuthFetch.mockImplementation((url: string) => {
      if (url.includes('/inventory/expiring')) return makeExpiryResponse();
      return makeLedgerResponse();
    });

    renderInventoryPage();

    await waitFor(() => {
      expect(screen.getByTestId('expiry-toggle-30')).toBeTruthy();
      expect(screen.getByTestId('expiry-toggle-90')).toBeTruthy();
      expect(screen.getByTestId('expiry-toggle-180')).toBeTruthy();
    });
  });

  it('clicking daysAhead toggle re-fetches with new value', async () => {
    mockAuthFetch.mockImplementation((url: string) => {
      if (url.includes('/inventory/expiring')) return makeExpiryResponse();
      return makeLedgerResponse();
    });

    renderInventoryPage();

    await waitFor(() => {
      expect(screen.getByTestId('expiry-toggle-30')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('expiry-toggle-30'));

    await waitFor(() => {
      // Should have called the expiring endpoint with daysAhead=30
      const calls = mockAuthFetch.mock.calls.filter(
        (c: string[]) => c[0].includes('/inventory/expiring')
      );
      expect(calls.some((c: string[]) => c[0].includes('daysAhead=30'))).toBe(true);
    });
  });

  it('shows expired items with negative days rendered as "Xd ago"', async () => {
    const expiring = [
      makeExpiryProduct({ id: '1', daysRemaining: -5, severity: 'expired' }),
    ];

    mockAuthFetch.mockImplementation((url: string) => {
      if (url.includes('/inventory/expiring')) return makeExpiryResponse(expiring);
      return makeLedgerResponse();
    });

    renderInventoryPage();

    await waitFor(() => {
      const badge = screen.getByTestId('expiry-days-badge');
      expect(badge.textContent).toContain('5d ago');
    });
  });

  it('shows EXPIRED severity badge in badge-danger class', async () => {
    const expiring = [
      makeExpiryProduct({ id: '1', daysRemaining: -2, severity: 'expired' }),
    ];

    mockAuthFetch.mockImplementation((url: string) => {
      if (url.includes('/inventory/expiring')) return makeExpiryResponse(expiring);
      return makeLedgerResponse();
    });

    renderInventoryPage();

    await waitFor(() => {
      const severityBadge = screen.getByTestId('expiry-severity-badge');
      expect(severityBadge.className).toContain('badge-danger');
      expect(severityBadge.textContent).toBe('EXPIRED');
    });
  });
});
