import { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { authFetch } from '../lib/api';

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
  const { accessToken } = useAuth();
  const [filter, setFilter] = useState<'all' | 'INWARD' | 'OUTWARD' | 'ADJUSTMENT'>('all');
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ total: 0, hasMore: false });
  const [totals, setTotals] = useState({ totalSkus: 0, totalEntries: 0, todaysMovements: 0 });

  // Fetch ledger entries from API
  useEffect(() => {
    if (!accessToken) return;

    const fetchLedger = async () => {
      setLoading(true);
      setError(null);
      try {
        // Map display filter to API transaction types
        let url = '/api/v1/retailer-admin/inventory/ledger?limit=100';
        if (filter === 'INWARD') {
          url += '&transactionType=purchase_received';
        } else if (filter === 'OUTWARD') {
          url += '&transactionType=sale';
        } else if (filter === 'ADJUSTMENT') {
          url += '&transactionType=adjustment';
        }

        const response = await authFetch(url, accessToken);
        if (response.status === 401) return;
        if (!response.ok) throw new Error('Failed to fetch ledger');

        const data: LedgerResponse = await response.json();
        setLedgerEntries(data.data || []);
        setPagination({ total: data.pagination?.total || 0, hasMore: data.pagination?.hasMore || false });
        if (data.totals) {
          setTotals(data.totals);
        }
      } catch (err) {
        console.error('Failed to load ledger:', err);
        setError('Failed to load inventory ledger');
        setLedgerEntries([]);
      } finally {
        setLoading(false);
      }
    };

    fetchLedger();
  }, [accessToken, filter]);

  // RCAT-LEDGER-001: Use backend-provided totals for accuracy
  const totalSKUs = totals.totalSkus;
  const todayMovements = totals.todaysMovements;

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Inventory Ledger</h1>
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

        {/* Ledger Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
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
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--danger)' }}>
                    {error}
                  </td>
                </tr>
              ) : ledgerEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No ledger entries found. Stock movements will appear here.
                  </td>
                </tr>
              ) : (
                ledgerEntries.map((entry) => {
                  const displayType = getDisplayType(entry.transactionType);
                  return (
                    <tr key={entry.id}>
                      <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        {new Date(entry.createdAt).toLocaleString()}
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
