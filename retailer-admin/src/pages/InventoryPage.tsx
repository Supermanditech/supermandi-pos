import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { authFetch, safeJson } from '../lib/api';
// TZ-FORMAT-001: Use shared date/time formatters
import { formatDateTime } from '../lib/formatters';
// T-112: Breadcrumb navigation
import Breadcrumb from '../components/Breadcrumb';
// T-120: URL state for filter persistence
import { useUrlState } from '../hooks/useUrlState';
// GAP-2: EmptyState component for consistent empty states
import EmptyState from '../components/EmptyState';
import { ClipboardList, RefreshCw, AlertTriangle, ArrowUpDown } from 'lucide-react';
import { logger } from '../lib/logger';

// SCALE-C3: Stock product row for FEFO-sorted stock table
interface StockProduct {
  productId: string;
  productName: string;
  barcode: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  totalStockQty: number;
  totalPurchaseValue: number;
  totalSellRevenue: number;
}

interface StockResponse {
  success: boolean;
  data: StockProduct[];
  totals: {
    totalProducts: number;
    totalStockQty: number;
    totalPurchaseValue: number;
    totalSellRevenue: number;
  };
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  sort: string;
  lastUpdated: string;
}

// SCALE-C3: Sort options for stock table
type StockSortOption = 'default' | 'fefo' | 'name' | 'stock_low';

const STOCK_SORT_LABELS: Record<StockSortOption, string> = {
  default: 'Default',
  fefo: 'FEFO (Earliest Expiry First)',
  name: 'Name A-Z',
  stock_low: 'Stock Low-High',
};

/** Format expiry date as DD-Mon-YY */
function formatExpiryDate(isoDate: string | null): string {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en-US', { month: 'short' });
  const year = String(d.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

/** Compute days until expiry from today */
function daysUntilExpiry(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const nowDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const expDay = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((expDay - nowDay) / (1000 * 60 * 60 * 24));
}

// SCALE-C2: Expiry alert types
interface ExpiringProduct {
  id: string;
  productId: string;
  name: string;
  barcode: string;
  quantity: number;
  expiryDate: string;
  daysRemaining: number;
  batchNumber: string | null;
  severity: 'expired' | 'critical' | 'warning';
}

interface ExpiryAlertsResponse {
  expiring: ExpiringProduct[];
  counts: { expired: number; critical: number; warning: number };
}

type ExpiryDaysFilter = 30 | 90 | 180;

// FE-RETAILER-INVENTORY-001: Real ledger entry from API
interface LedgerEntry {
  id: string;
  storeId: string;
  productId: string;
  productName: string;
  barcode?: string;
  deltaQty: number;
  transactionType: 'sale' | 'sale_return' | 'purchase_received' | 'adjustment' | 'opening_stock';
  referenceType?: string;
  referenceId?: string;
  stockBefore: number;
  stockAfter: number;
  unitCost?: number;
  createdAt: string;
}

interface LedgerResponse {
  success: boolean;
  data: LedgerEntry[];
  totals?: {
    totalSkus: number;
    totalEntries: number;
    todaysMovements: number;
  };
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// Map transaction types to display types
function getDisplayType(transactionType: string): 'INWARD' | 'OUTWARD' | 'ADJUSTMENT' {
  switch (transactionType) {
    case 'purchase_received':
    case 'opening_stock':
    case 'sale_return':
      return 'INWARD';
    case 'sale':
      return 'OUTWARD';
    case 'adjustment':
    default:
      return 'ADJUSTMENT';
  }
}

export default function InventoryPage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { accessToken } = useAuth();
  // T-120: Sync filter with URL for back/forward persistence
  const [filterValue, setFilterValue] = useUrlState('filter', 'all');
  const filter = filterValue as 'all' | 'INWARD' | 'OUTWARD' | 'ADJUSTMENT';
  const setFilter = setFilterValue;
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setPagination] = useState({ total: 0, hasMore: false });
  const [totals, setTotals] = useState({ totalSkus: 0, totalEntries: 0, todaysMovements: 0 });
  // RET-AUD-034: Date range filters
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  // SCALE-C2: Expiry alerts state
  const [expiryData, setExpiryData] = useState<ExpiryAlertsResponse | null>(null);
  const [expiryLoading, setExpiryLoading] = useState(true);
  const [expiryError, setExpiryError] = useState<string | null>(null);
  const [expiryDaysAhead, setExpiryDaysAhead] = useState<ExpiryDaysFilter>(90);

  // T-183: Auto-refresh state
  const [lastRefreshAt, setLastRefreshAt] = useState<number>(Date.now());
  const [secondsSinceRefresh, setSecondsSinceRefresh] = useState<number>(0);
  const [refreshFlash, setRefreshFlash] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const AUTO_REFRESH_INTERVAL_MS = 30000; // 30 seconds

  // SCALE-C3: Stock view with FEFO sort support
  // useUrlState always returns string — cast via as for type safety at usage sites
  const [activeTab, setActiveTab] = useUrlState('tab', 'ledger');
  const [stockSort, setStockSort] = useUrlState('stockSort', 'default');
  const [stockProducts, setStockProducts] = useState<StockProduct[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [stockSortOpen, setStockSortOpen] = useState(false);

  // GO-LIVE-021: Extract fetchLedger to allow retry on error
  const fetchLedger = useCallback(async (options?: { silent?: boolean }) => {
    if (!accessToken) return;

    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      // Map display filter to API transaction types
      let url = '/api/v1/retailer-admin/inventory/ledger?limit=100';
      // STG-060: INWARD includes purchase_received, sale_return, and opening_stock
      if (filter === 'INWARD') {
        url += '&transactionType=purchase_received,sale_return,opening_stock';
      } else if (filter === 'OUTWARD') {
        url += '&transactionType=sale';
      } else if (filter === 'ADJUSTMENT') {
        url += '&transactionType=adjustment';
      }

      // RET-AUD-034: Add date range filter parameters
      if (startDate) {
        url += `&startDate=${encodeURIComponent(startDate)}`;
      }
      if (endDate) {
        url += `&endDate=${encodeURIComponent(endDate)}`;
      }

      const response = await authFetch(url, accessToken);
      if (response.status === 401) return;
      if (!response.ok) throw new Error('Failed to fetch ledger');

      // GO-LIVE-020: Use safe JSON parsing
      const data = await safeJson<LedgerResponse>(response);
      if (!data) throw new Error('Invalid response from server');

      setLedgerEntries(data.data || []);
      setPagination({ total: data.pagination?.total || 0, hasMore: data.pagination?.hasMore || false });
      if (data.totals) {
        setTotals(data.totals);
      }
      // T-183: Track last refresh time and trigger subtle flash animation
      setLastRefreshAt(Date.now());
      setSecondsSinceRefresh(0);
      if (options?.silent) {
        setRefreshFlash(true);
        setTimeout(() => setRefreshFlash(false), 600);
      }
    } catch (err) {
      logger.error('Failed to load ledger:', err);
      setError('Failed to load inventory ledger. Please try again.');
      setLedgerEntries([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, filter, startDate, endDate]);

  // Fetch ledger entries from API
  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  // SCALE-C2: Fetch expiry alerts
  const fetchExpiryAlerts = useCallback(async () => {
    if (!accessToken) return;
    setExpiryLoading(true);
    setExpiryError(null);
    try {
      const url = `/api/v1/retailer-admin/inventory/expiring?daysAhead=${expiryDaysAhead}`;
      const response = await authFetch(url, accessToken);
      if (response.status === 401) return;
      if (!response.ok) throw new Error('Failed to fetch expiry alerts');
      const data = await safeJson<ExpiryAlertsResponse>(response);
      if (!data) throw new Error('Invalid response from server');
      setExpiryData(data);
    } catch (err) {
      logger.error('Failed to load expiry alerts:', err);
      setExpiryError('Failed to load expiry alerts. Please try again.');
      setExpiryData(null);
    } finally {
      setExpiryLoading(false);
    }
  }, [accessToken, expiryDaysAhead]);

  useEffect(() => {
    fetchExpiryAlerts();
  }, [fetchExpiryAlerts]);

  // SCALE-C3: Fetch stock products with optional FEFO/sort
  const fetchStock = useCallback(async () => {
    if (!accessToken) return;
    setStockLoading(true);
    setStockError(null);
    const currentSort = stockSort as StockSortOption;
    try {
      let url = '/api/v1/retailer-admin/inventory?limit=200';
      // SCALE-C3: Map sort option to API params
      if (currentSort === 'fefo') {
        url += '&sort=fefo';
      }
      // 'name' = default API sort (A-Z), no extra param needed
      // 'stock_low' = client-side sort after fetch
      const response = await authFetch(url, accessToken);
      if (response.status === 401) return;
      if (!response.ok) throw new Error('Failed to fetch stock');
      const data = await safeJson<StockResponse>(response);
      if (!data) throw new Error('Invalid response from server');
      let products = data.data || [];
      // Client-side sort for stock_low (server doesn't support this sort natively)
      if (currentSort === 'stock_low') {
        products = [...products].sort((a, b) => a.totalStockQty - b.totalStockQty);
      }
      setStockProducts(products);
    } catch (err) {
      logger.error('Failed to load stock:', err);
      setStockError('Failed to load stock. Please try again.');
      setStockProducts([]);
    } finally {
      setStockLoading(false);
    }
  }, [accessToken, stockSort]);

  useEffect(() => {
    if (activeTab === 'stock') {
      fetchStock();
    }
  }, [activeTab, fetchStock]);

  // T-183: Auto-refresh polling — only when page is focused
  useEffect(() => {
    // Update "seconds ago" counter every second
    const counterInterval = setInterval(() => {
      setSecondsSinceRefresh(Math.floor((Date.now() - lastRefreshAt) / 1000));
    }, 1000);

    // Set up 30-second polling (only fetch when page is visible)
    pollIntervalRef.current = setInterval(() => {
      if (document.visibilityState === 'visible' && accessToken) {
        fetchLedger({ silent: true });
      }
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(counterInterval);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [fetchLedger, accessToken, lastRefreshAt]);

  // T-183: Refresh when tab regains focus (if stale)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && accessToken) {
        const elapsed = Date.now() - lastRefreshAt;
        // If more than 30 seconds have passed while tab was hidden, refresh
        if (elapsed >= AUTO_REFRESH_INTERVAL_MS) {
          fetchLedger({ silent: true });
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [accessToken, lastRefreshAt, fetchLedger]);

  // RCAT-LEDGER-001: Use backend-provided totals for accuracy
  const totalSKUs = totals.totalSkus;
  const todayMovements = totals.todaysMovements;

  // STG-483: Auth loading guard
  if (!accessToken) return <div className="text-center-muted">Loading...</div>;

  return (
    <>
      {/* T-112: Breadcrumb navigation */}
      <div className="breadcrumb-wrap">
        <Breadcrumb items={[{ label: 'Home', path: `/s/${storeCode}` }, { label: 'Inventory' }]} />
      </div>
      <header className="page-header">
        <div className="flex-between-wrap">
          <h1 className="page-title page-title--compact">Inventory</h1>
          <div className="flex-row btn-icon">
            {activeTab === 'ledger' && (
              <>
                {/* T-183: Last updated indicator */}
                <span className="text-xs-muted">
                  Updated {secondsSinceRefresh < 5 ? 'just now' : `${secondsSinceRefresh}s ago`}
                </span>
                {/* T-183: Manual refresh button */}
                <button
                  aria-label="Refresh inventory data"
                  className="btn btn-secondary btn-icon btn-sm"
                  onClick={() => fetchLedger()}
                  disabled={loading}
                >
                  <RefreshCw style={{ width: 14, height: 14, transition: 'transform 0.3s', transform: loading ? 'rotate(180deg)' : 'none' }} />
                  Refresh
                </button>
              </>
            )}
            {activeTab === 'stock' && (
              <button
                aria-label="Refresh stock data"
                className="btn btn-secondary btn-icon btn-sm"
                onClick={() => fetchStock()}
                disabled={stockLoading}
              >
                <RefreshCw style={{ width: 14, height: 14, transition: 'transform 0.3s', transform: stockLoading ? 'rotate(180deg)' : 'none' }} />
                Refresh
              </button>
            )}
          </div>
        </div>
        {/* SCALE-C3: Tab switcher — Ledger | Stock */}
        <div className="flex-row grid-mb-sm" style={{ marginTop: 8 }}>
          <button
            className={`btn ${activeTab === 'ledger' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('ledger')}
            aria-pressed={activeTab === 'ledger'}
            data-testid="tab-ledger"
          >
            Ledger
          </button>
          <button
            className={`btn ${activeTab === 'stock' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('stock')}
            aria-pressed={activeTab === 'stock'}
            data-testid="tab-stock"
          >
            Stock
          </button>
        </div>
      </header>

      <div className="page-content">
        {/* Summary Stats (Ledger tab only) */}
        {activeTab === 'ledger' && (
        <div className="grid grid-4 grid-mb-lg">
          <div className="stat-card">
            <div className="stat-label">📦 Total SKUs</div>
            <div className="stat-value">{loading ? '...' : totalSKUs}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">📋 Total Entries</div>
            <div className="stat-value">{loading ? '...' : totals.totalEntries}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">📈 Today's Movements</div>
            <div className="stat-value">{loading ? '...' : todayMovements}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">📊 Showing</div>
            <div className="stat-value">{loading ? '...' : ledgerEntries.length}</div>
          </div>
        </div>
        )}

        {/* SCALE-C3: Stock tab with FEFO sort */}
        {activeTab === 'stock' && (
          <div>
            {/* Sort selector */}
            <div className="flex-between-wrap grid-mb">
              <div className="flex-row btn-icon" style={{ position: 'relative' }}>
                <button
                  className="btn btn-secondary btn-icon btn-sm"
                  onClick={() => setStockSortOpen((prev) => !prev)}
                  data-testid="stock-sort-btn"
                  aria-label="Change stock sort order"
                >
                  <ArrowUpDown style={{ width: 14, height: 14 }} />
                  {STOCK_SORT_LABELS[stockSort as StockSortOption]}
                </button>
                {stockSortOpen && (
                  <div
                    className="card card-no-padding"
                    style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, minWidth: 220, marginTop: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}
                    data-testid="stock-sort-dropdown"
                  >
                    {(Object.keys(STOCK_SORT_LABELS) as StockSortOption[]).map((opt) => (
                      <button
                        key={opt}
                        className={`btn btn-ghost btn-sm ${stockSort === opt ? 'btn-primary' : ''}`}
                        style={{ width: '100%', textAlign: 'left', borderRadius: 0 }}
                        onClick={() => {
                          setStockSort(opt);
                          setStockSortOpen(false);
                        }}
                        data-testid={`sort-option-${opt}`}
                      >
                        {opt === 'fefo' ? '⏰ ' : ''}{STOCK_SORT_LABELS[opt]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {stockSort === 'fefo' && (
                <span className="badge badge-warning" style={{ fontSize: 12 }}>
                  FEFO active — earliest expiry shown first
                </span>
              )}
            </div>

            {/* Stock table */}
            <div className="card card-no-padding">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Barcode</th>
                    <th>Batch</th>
                    <th>Expiry</th>
                    <th>Stock Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {stockLoading ? (
                    <tr>
                      <td colSpan={5} className="td-center-muted">Loading stock...</td>
                    </tr>
                  ) : stockError ? (
                    <tr>
                      <td colSpan={5} className="td-center">
                        <div className="text-danger-mb">{stockError}</div>
                        <button onClick={() => fetchStock()} className="btn btn-primary">Retry</button>
                      </td>
                    </tr>
                  ) : stockProducts.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <EmptyState
                          icon={<ClipboardList size={24} />}
                          title="No stock found"
                          description="Add products to your store to see stock here."
                        />
                      </td>
                    </tr>
                  ) : (
                    stockProducts.map((product) => {
                      const days = daysUntilExpiry(product.expiryDate);
                      const expiryBadge = days === null ? null
                        : days < 0 ? <span className="badge badge-danger" style={{ marginLeft: 4, fontSize: 10 }}>EXPIRED</span>
                        : days <= 30 ? <span className="badge badge-danger" style={{ marginLeft: 4, fontSize: 10 }}>{days}d</span>
                        : days <= 90 ? <span className="badge badge-warning" style={{ marginLeft: 4, fontSize: 10 }}>{days}d</span>
                        : null;
                      return (
                        <tr key={product.productId}>
                          <td>{product.productName}</td>
                          <td className="text-sm-muted">{product.barcode || '—'}</td>
                          <td className="text-sm-muted">{product.batchNumber || '—'}</td>
                          <td>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              {formatExpiryDate(product.expiryDate)}
                              {expiryBadge}
                            </span>
                          </td>
                          <td className="cell-bold">{product.totalStockQty}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Ledger tab content */}
        {activeTab === 'ledger' && (<>

        {/* SCALE-C2: Expiry Alerts Section */}
        <div className="card" style={{ marginBottom: '1.5rem' }} data-testid="expiry-alerts-section">
          <div className="flex-between-wrap" style={{ marginBottom: '0.75rem' }}>
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={18} style={{ color: 'var(--warning)' }} />
              Expiry Alerts
            </h2>
            {/* Days ahead toggle */}
            <div className="flex-row btn-icon" data-testid="expiry-days-toggle">
              {([30, 90, 180] as ExpiryDaysFilter[]).map((d) => (
                <button
                  key={d}
                  className={`btn btn-sm ${expiryDaysAhead === d ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setExpiryDaysAhead(d)}
                  aria-pressed={expiryDaysAhead === d}
                  data-testid={`expiry-toggle-${d}`}
                >
                  {d} days
                </button>
              ))}
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-4 grid-mb" data-testid="expiry-summary-cards">
            <div
              className="stat-card"
              style={{ borderLeft: '3px solid var(--danger)', background: 'var(--danger-soft, #fff5f5)' }}
              data-testid="expiry-card-expired"
            >
              <div className="stat-label" style={{ color: 'var(--danger)' }}>Expired</div>
              <div className="stat-value" style={{ color: 'var(--danger)' }}>
                {expiryLoading ? '...' : (expiryData?.counts?.expired ?? 0)}
              </div>
            </div>
            <div
              className="stat-card"
              style={{ borderLeft: '3px solid var(--danger)', background: 'var(--danger-soft, #fff5f5)' }}
              data-testid="expiry-card-critical"
            >
              <div className="stat-label" style={{ color: 'var(--danger)' }}>Critical (&le;30 days)</div>
              <div className="stat-value" style={{ color: 'var(--danger)' }}>
                {expiryLoading ? '...' : (expiryData?.counts?.critical ?? 0)}
              </div>
            </div>
            <div
              className="stat-card"
              style={{ borderLeft: '3px solid var(--warning)', background: 'var(--warning-soft, #fffbf0)' }}
              data-testid="expiry-card-warning"
            >
              <div className="stat-label" style={{ color: 'var(--warning)' }}>Warning (31-90 days)</div>
              <div className="stat-value" style={{ color: 'var(--warning)' }}>
                {expiryLoading ? '...' : (expiryData?.counts?.warning ?? 0)}
              </div>
            </div>
            <div className="stat-card" data-testid="expiry-card-total">
              <div className="stat-label">Total Expiring</div>
              <div className="stat-value">
                {expiryLoading ? '...' : (expiryData?.expiring?.length ?? 0)}
              </div>
            </div>
          </div>

          {/* Expiry table */}
          <div className="card card-no-padding" data-testid="expiry-table-container">
            <table className="table" data-testid="expiry-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Batch</th>
                  <th>Expiry Date</th>
                  <th>Days Remaining</th>
                  <th>Stock Qty</th>
                  <th>Severity</th>
                </tr>
              </thead>
              <tbody>
                {expiryLoading ? (
                  <tr>
                    <td colSpan={6} className="td-center-muted" data-testid="expiry-loading">
                      Loading expiry data...
                    </td>
                  </tr>
                ) : expiryError ? (
                  <tr>
                    <td colSpan={6} className="td-center" data-testid="expiry-error">
                      <div className="text-danger-mb">{expiryError}</div>
                      <button
                        onClick={() => fetchExpiryAlerts()}
                        disabled={expiryLoading}
                        className="btn btn-primary"
                      >
                        Retry
                      </button>
                    </td>
                  </tr>
                ) : !expiryData || !expiryData.expiring || expiryData.expiring.length === 0 ? (
                  <tr>
                    <td colSpan={6} data-testid="expiry-empty">
                      <EmptyState
                        icon={<AlertTriangle size={24} />}
                        title="No expiring products"
                        description={`No products expire within the next ${expiryDaysAhead} days.`}
                      />
                    </td>
                  </tr>
                ) : (
                  expiryData.expiring.map((product) => {
                    const isExpired = product.daysRemaining < 0;
                    const isCritical = product.severity === 'critical';
                    const daysBadgeColor = isExpired || isCritical
                      ? 'var(--danger)'
                      : 'var(--warning)';
                    return (
                      <tr key={product.id} data-testid="expiry-row">
                        <td data-testid="expiry-product-name">{product.name}</td>
                        <td data-testid="expiry-batch">{product.batchNumber ?? '—'}</td>
                        <td data-testid="expiry-date">{product.expiryDate}</td>
                        <td>
                          <span
                            style={{
                              color: daysBadgeColor,
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: isExpired || isCritical
                                ? 'var(--danger-soft, #fff5f5)'
                                : 'var(--warning-soft, #fffbf0)',
                            }}
                            data-testid="expiry-days-badge"
                          >
                            {product.daysRemaining < 0
                              ? `${Math.abs(product.daysRemaining)}d ago`
                              : `${product.daysRemaining}d`}
                          </span>
                        </td>
                        <td data-testid="expiry-qty">{product.quantity}</td>
                        <td>
                          <span
                            className={`badge ${
                              product.severity === 'expired' ? 'badge-danger' :
                              product.severity === 'critical' ? 'badge-danger' :
                              'badge-warning'
                            }`}
                            data-testid="expiry-severity-badge"
                          >
                            {product.severity.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex-row grid-mb">
          {(['all', 'INWARD', 'OUTWARD', 'ADJUSTMENT'] as const).map((f) => (
            <button
              key={f}
              className={`btn ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
            >
              {f === 'all' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* RET-AUD-034: Date Range Filter */}
        <div className="flex-between-wrap grid-mb">
          <div className="flex-row btn-icon">
            <label className="form-label-inline" htmlFor="inv-start-date">From:</label>
            <input
              id="inv-start-date"
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(e) => setStartDate(e.target.value)}
              className="form-input-date"
            />
          </div>
          <div className="flex-row btn-icon">
            <label className="form-label-inline" htmlFor="inv-end-date">To:</label>
            <input
              id="inv-end-date"
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className="form-input-date"
            />
          </div>
          {(startDate || endDate) && (
            <button
              className="btn btn-secondary btn-text-sm"
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
            >
              Clear Dates
            </button>
          )}
        </div>

        {/* Ledger Table — T-183: refreshFlash adds subtle highlight animation on auto-refresh */}
        <div className="card card-no-padding" style={{
          transition: 'box-shadow 0.3s ease',
          boxShadow: refreshFlash ? '0 0 0 2px var(--primary)' : undefined,
        }}>
          <table className="table">
            <thead>
              <tr>
                <th>Date/Time</th>
                <th>Product</th>
                <th>Type</th>
                <th>Qty Change</th>
                <th>Reference</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="td-center-muted">
                    Loading ledger entries...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="td-center">
                    <div className="text-danger-mb">{error}</div>
                    {/* GO-LIVE-021 + RET-C2-006: Retry button with loading state */}
                    <button
                      onClick={() => fetchLedger()}
                      disabled={loading}
                      className="btn btn-primary"
                    >
                      {loading ? 'Retrying...' : 'Retry'}
                    </button>
                  </td>
                </tr>
              ) : ledgerEntries.length === 0 ? (
                <tr>
                  {/* GL-CRIT-0073: Contextual empty state based on filter — GAP-2: Using EmptyState component */}
                  <td colSpan={6}>
                    <EmptyState
                      icon={<ClipboardList size={24} />}
                      title={
                        filter === 'INWARD' ? 'No inward entries found'
                        : filter === 'OUTWARD' ? 'No sales recorded yet'
                        : filter === 'ADJUSTMENT' ? 'No stock adjustments found'
                        : 'No ledger entries yet'
                      }
                      description={
                        /* RET-C2-005: Account for date range in empty state message */
                        (startDate || endDate) ? 'No entries found for the selected date range. Try adjusting the filters.'
                        : filter === 'INWARD' ? 'These will appear when you receive stock from suppliers or record purchase receipts.'
                        : filter === 'OUTWARD' ? 'Outward entries will appear when items are sold through POS.'
                        : filter === 'ADJUSTMENT' ? 'Use this to track manual stock corrections, damage, or expired goods.'
                        : 'Stock movements will appear here once you start selling or receiving inventory.'
                      }
                    />
                  </td>
                </tr>
              ) : (
                ledgerEntries.map((entry) => {
                  const displayType = getDisplayType(entry.transactionType);
                  return (
                    <tr key={entry.id}>
                      <td className="text-sm-muted">
                        {formatDateTime(entry.createdAt)}
                      </td>
                      <td>{entry.productName || entry.productId}</td>
                      <td>
                        <span className={`badge ${
                          displayType === 'INWARD' ? 'badge-success' :
                          displayType === 'OUTWARD' ? 'badge-warning' :
                          'badge-danger'
                        }`}>
                          {displayType}
                        </span>
                      </td>
                      <td style={{
                        color: Number(entry.deltaQty) > 0 ? 'var(--success)' : 'var(--danger)',
                        fontWeight: '500'
                      }}>
                        {Number(entry.deltaQty) > 0 ? '+' : ''}{Number(entry.deltaQty) || 0}
                      </td>
                      <td className="text-sm-muted">
                        {entry.transactionType}{entry.referenceId ? ` #${entry.referenceId.slice(0, 8)}` : ''}
                      </td>
                      <td className="cell-bold">{Number(entry.stockAfter) || 0}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Info Box */}
        <div className="info-box">
          <p className="info-box-text">
            💡 <strong>Note:</strong> Inventory changes are tracked through the ledger.
            Direct stock edits create ADJUSTMENT entries for audit trail.
          </p>
        </div>
        </>)}
      </div>
    </>
  );
}
