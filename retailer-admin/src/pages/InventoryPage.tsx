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
import { ClipboardList, RefreshCw } from 'lucide-react';
import { logger } from '../lib/logger';

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
  // T-183: Auto-refresh state
  const [lastRefreshAt, setLastRefreshAt] = useState<number>(Date.now());
  const [secondsSinceRefresh, setSecondsSinceRefresh] = useState<number>(0);
  const [refreshFlash, setRefreshFlash] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const AUTO_REFRESH_INTERVAL_MS = 30000; // 30 seconds

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

  return (
    <>
      {/* T-112: Breadcrumb navigation */}
      <div style={{ padding: '0 1rem' }}>
        <Breadcrumb items={[{ label: 'Home', path: `/s/${storeCode}` }, { label: 'Inventory' }]} />
      </div>
      <header className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h1 className="page-title" style={{ margin: 0 }}>Inventory Ledger</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* T-183: Last updated indicator */}
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Updated {secondsSinceRefresh < 5 ? 'just now' : `${secondsSinceRefresh}s ago`}
            </span>
            {/* T-183: Manual refresh button */}
            <button
              aria-label="Refresh inventory data"
              className="btn btn-secondary"
              onClick={() => fetchLedger()}
              disabled={loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.75rem' }}
            >
              <RefreshCw style={{ width: 14, height: 14, transition: 'transform 0.3s', transform: loading ? 'rotate(180deg)' : 'none' }} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="page-content">
        {/* Summary Stats */}
        <div className="grid grid-4" style={{ marginBottom: '1.5rem' }}>
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

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          {(['all', 'INWARD', 'OUTWARD', 'ADJUSTMENT'] as const).map((f) => (
            <button
              key={f}
              className={`btn ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* RET-AUD-034: Date Range Filter */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>From:</label>
            <input
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                fontSize: '0.875rem',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>To:</label>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                fontSize: '0.875rem',
              }}
            />
          </div>
          {(startDate || endDate) && (
            <button
              className="btn btn-secondary"
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              style={{ fontSize: '0.875rem' }}
            >
              Clear Dates
            </button>
          )}
        </div>

        {/* Ledger Table — T-183: refreshFlash adds subtle highlight animation on auto-refresh */}
        <div className="card" style={{
          padding: 0, overflow: 'hidden',
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
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    Loading ledger entries...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                    <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</div>
                    {/* GO-LIVE-021 + RET-C2-006: Retry button with loading state */}
                    <button
                      onClick={() => fetchLedger()}
                      disabled={loading}
                      style={{
                        padding: '0.5rem 1rem',
                        background: loading ? '#94a3b8' : 'var(--primary)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        fontSize: '0.875rem',
                      }}
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
                      <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
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
                      <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        {entry.transactionType}{entry.referenceId ? ` #${entry.referenceId.slice(0, 8)}` : ''}
                      </td>
                      <td style={{ fontWeight: '500' }}>{Number(entry.stockAfter) || 0}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Info Box */}
        <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#eff6ff', borderRadius: '0.5rem' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            💡 <strong>Note:</strong> Inventory changes are tracked through the ledger.
            Direct stock edits create ADJUSTMENT entries for audit trail.
          </p>
        </div>
      </div>
    </>
  );
}
