import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { fetchStockAdjustments } from '../api/store';
import type { StockAdjustment } from '../api/store';
import { formatDateTime } from '../lib/formatters';
import Breadcrumb from '../components/Breadcrumb';
import EmptyState from '../components/EmptyState';
import { ClipboardList, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { logger } from '../lib/logger';

// SA-P1-011: Display-friendly reason labels
const REASON_LABELS: Record<string, string> = {
  damage: 'Damage',
  theft: 'Theft',
  expired: 'Expired',
  found: 'Found',
  correction: 'Correction',
  other: 'Other',
};

function formatReason(reason: string | null): string {
  if (!reason) return 'N/A';
  return REASON_LABELS[reason] || reason;
}

function formatSource(source: string | null): string {
  if (!source) return 'Unknown';
  if (source === 'POS_MANUAL_ADJUST') return 'POS Device';
  if (source === 'LEGACY_LEDGER_SERVICE') return 'System';
  if (source === 'RETURN_SERVICE') return 'Return';
  return source;
}

export default function StockAdjustmentHistoryPage() {
  const { accessToken } = useAuth();
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);

  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');

  const loadAdjustments = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchStockAdjustments(accessToken, {
        from: fromDate || undefined,
        to: toDate || undefined,
        reason: reasonFilter || undefined,
        page,
        limit,
      });
      setAdjustments(result.adjustments);
      setTotal(result.total);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load adjustments';
      setError(msg);
      logger.error('[SA-P1-011] Load adjustments error:', msg);
    } finally {
      setLoading(false);
    }
  }, [accessToken, fromDate, toDate, reasonFilter, page, limit]);

  useEffect(() => {
    loadAdjustments();
  }, [loadAdjustments]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [fromDate, toDate, reasonFilter]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div style={{ padding: '1.5rem' }}>
      <Breadcrumb items={[
        { label: 'Stock Adjustments' },
      ]} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>
          Stock Adjustment History
        </h1>
        <button
          onClick={loadAdjustments}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0.5rem 1rem', border: '1px solid #d1d5db',
            borderRadius: 8, background: 'white', cursor: 'pointer',
            fontSize: '0.875rem', color: '#374151',
          }}
          aria-label="Refresh"
        >
          <RefreshCw style={{ width: 16, height: 16, animation: loading ? 'spin 1s linear infinite' : undefined }} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap',
        alignItems: 'flex-end',
      }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 }}>From</label>
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            style={{
              padding: '0.375rem 0.5rem', border: '1px solid #d1d5db',
              borderRadius: 6, fontSize: '0.875rem',
            }}
            data-testid="filter-from"
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 }}>To</label>
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            style={{
              padding: '0.375rem 0.5rem', border: '1px solid #d1d5db',
              borderRadius: 6, fontSize: '0.875rem',
            }}
            data-testid="filter-to"
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 2 }}>Reason</label>
          <select
            value={reasonFilter}
            onChange={e => setReasonFilter(e.target.value)}
            style={{
              padding: '0.375rem 0.5rem', border: '1px solid #d1d5db',
              borderRadius: 6, fontSize: '0.875rem', background: 'white',
            }}
            data-testid="filter-reason"
          >
            <option value="">All Reasons</option>
            <option value="damage">Damage</option>
            <option value="theft">Theft</option>
            <option value="expired">Expired</option>
            <option value="found">Found</option>
            <option value="correction">Correction</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div style={{
          padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: 8, color: '#b91c1c', marginBottom: '1rem', fontSize: '0.875rem',
        }}
        data-testid="error-message"
        >
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && !adjustments.length && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
          Loading adjustments...
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && adjustments.length === 0 && (
        <EmptyState
          title="No Stock Adjustments"
          description="No stock adjustments have been recorded yet. Adjustments made from the POS device will appear here."
          icon={<ClipboardList style={{ width: 48, height: 48, color: '#9ca3af' }} />}
        />
      )}

      {/* Data table */}
      {adjustments.length > 0 && (
        <>
          <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: 600, color: '#374151' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: 600, color: '#374151' }}>Product</th>
                  <th style={{ textAlign: 'right', padding: '0.75rem', fontWeight: 600, color: '#374151' }}>Old Qty</th>
                  <th style={{ textAlign: 'right', padding: '0.75rem', fontWeight: 600, color: '#374151' }}>New Qty</th>
                  <th style={{ textAlign: 'right', padding: '0.75rem', fontWeight: 600, color: '#374151' }}>Change</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: 600, color: '#374151' }}>Reason</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: 600, color: '#374151' }}>Adjusted By</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map(adj => {
                  const change = adj.newQty - adj.oldQty;
                  return (
                    <tr key={adj.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.75rem', whiteSpace: 'nowrap' }}>
                        {formatDateTime(adj.adjustedAt)}
                      </td>
                      <td style={{ padding: '0.75rem' }}>{adj.productName}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>{adj.oldQty}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>{adj.newQty}</td>
                      <td style={{
                        padding: '0.75rem', textAlign: 'right', fontWeight: 600,
                        color: change > 0 ? '#16a34a' : change < 0 ? '#dc2626' : '#6b7280',
                      }}>
                        {change > 0 ? `+${change}` : change}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px',
                          background: '#f3f4f6', borderRadius: 4,
                          fontSize: '0.75rem', fontWeight: 500,
                        }}>
                          {formatReason(adj.reason)}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', color: '#6b7280' }}>
                        {formatSource(adj.adjustedBy)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280',
          }}>
            <span>
              Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{
                  padding: '0.375rem 0.625rem', border: '1px solid #d1d5db',
                  borderRadius: 6, background: 'white', cursor: page <= 1 ? 'not-allowed' : 'pointer',
                  opacity: page <= 1 ? 0.5 : 1,
                }}
                aria-label="Previous page"
              >
                <ChevronLeft style={{ width: 16, height: 16 }} />
              </button>
              <span style={{ padding: '0.375rem 0.75rem', lineHeight: '1.5' }}>
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{
                  padding: '0.375rem 0.625rem', border: '1px solid #d1d5db',
                  borderRadius: 6, background: 'white', cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                  opacity: page >= totalPages ? 0.5 : 1,
                }}
                aria-label="Next page"
              >
                <ChevronRight style={{ width: 16, height: 16 }} />
              </button>
            </div>
          </div>
        </>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
