// T-151: Payment Reconciliation Dashboard
// Daily aggregate view of payment methods with export capability

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { authFetch, safeJson } from '../lib/api';
import Breadcrumb from '../components/Breadcrumb';
import EmptyState from '../components/EmptyState';
import { IndianRupee, Download, RefreshCw } from 'lucide-react';

// T-151: Expected API: GET /api/v1/retailer-admin/reports/reconciliation?from=YYYY-MM-DD&to=YYYY-MM-DD
// Response: { data: DayRow[], summary: { totalRevenue, upiTotal, cashTotal, dueTotal } }

interface DayRow {
  date: string;        // YYYY-MM-DD
  upiMinor: number;    // paise
  cashMinor: number;   // paise
  dueMinor: number;    // paise
  refundsMinor: number;// paise
  netTotalMinor: number;// paise
}

interface ReconciliationResponse {
  success: boolean;
  data: DayRow[];
  summary: {
    totalRevenueMinor: number;
    upiTotalMinor: number;
    cashTotalMinor: number;
    dueTotalMinor: number;
    refundsTotalMinor: number;
  };
}

/** Format paise to INR string */
function fmt(minor: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format((minor || 0) / 100);
}

/** Format YYYY-MM-DD to DD/MM/YYYY */
function fmtDateDDMMYYYY(isoDate: string): string {
  if (!isoDate) return '-';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

/** Get YYYY-MM-DD for N days ago */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

/** Convert DayRow[] to CSV string */
function toCsv(rows: DayRow[]): string {
  const header = 'Date,UPI (INR),Cash (INR),Due/Credit (INR),Refunds (INR),Net Total (INR)';
  const lines = rows.map(r =>
    [
      fmtDateDDMMYYYY(r.date),
      ((r.upiMinor || 0) / 100).toFixed(2),
      ((r.cashMinor || 0) / 100).toFixed(2),
      ((r.dueMinor || 0) / 100).toFixed(2),
      ((r.refundsMinor || 0) / 100).toFixed(2),
      ((r.netTotalMinor || 0) / 100).toFixed(2),
    ].join(',')
  );
  return [header, ...lines].join('\n');
}

export default function ReconciliationPage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { accessToken } = useAuth();

  const [fromDate, setFromDate] = useState(daysAgo(7));
  const [toDate, setToDate] = useState(daysAgo(0));
  const [rows, setRows] = useState<DayRow[]>([]);
  const [summary, setSummary] = useState<ReconciliationResponse['summary'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReconciliation = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const res = await authFetch(`/api/v1/retailer-admin/reports/reconciliation?${params}`, accessToken);
      if (res.status === 401) return;
      if (!res.ok) throw new Error(`Failed to load reconciliation data: ${res.status}`);
      const json = await safeJson<ReconciliationResponse>(res);
      if (!json) throw new Error('Invalid response from server');
      setRows(json.data || []);
      setSummary(json.summary || null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load reconciliation data';
      setError(message);
      setRows([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, fromDate, toDate]);

  useEffect(() => {
    fetchReconciliation();
  }, [fetchReconciliation]);

  const handleExportCsv = () => {
    if (rows.length === 0) return;
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reconciliation_${fromDate}_to_${toDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="breadcrumb-wrap">
        <Breadcrumb items={[{ label: 'Home', path: `/s/${storeCode}` }, { label: 'Reconciliation' }]} />
      </div>
      <header className="page-header">
        <div className="flex-between-wrap">
          <h1 className="page-title">Payment Reconciliation</h1>
          <div className="flex-row">
            <button
              aria-label="Refresh reconciliation data"
              className="btn btn-secondary btn-icon"
              onClick={fetchReconciliation}
              disabled={loading}
            >
              <RefreshCw size={14} />
              Refresh
            </button>
            <button
              aria-label="Export reconciliation as CSV"
              className="btn btn-primary btn-icon"
              onClick={handleExportCsv}
              disabled={rows.length === 0}
            >
              <Download size={14} />
              Export CSV
            </button>
          </div>
        </div>
      </header>

      <div className="page-content">
        {/* Date Range Picker */}
        <div className="recon-date-range">
          <div className="flex-row btn-icon">
            <label className="form-label-inline">From:</label>
            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(e) => setFromDate(e.target.value)}
              className="form-input-date"
            />
          </div>
          <div className="flex-row btn-icon">
            <label className="form-label-inline">To:</label>
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => setToDate(e.target.value)}
              className="form-input-date"
            />
          </div>
          <div className="flex-row">
            <button className="btn btn-secondary" onClick={() => { setFromDate(daysAgo(7)); setToDate(daysAgo(0)); }}>
              Last 7 Days
            </button>
            <button className="btn btn-secondary" onClick={() => { setFromDate(daysAgo(30)); setToDate(daysAgo(0)); }}>
              Last 30 Days
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && !loading && (
          <div className="grid grid-4 grid-mb-lg">
            <div className="stat-card">
              <div className="stat-label">Total Revenue</div>
              <div className="stat-value stat-value--success">{fmt(summary.totalRevenueMinor)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">UPI Total</div>
              <div className="stat-value">{fmt(summary.upiTotalMinor)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Cash Total</div>
              <div className="stat-value">{fmt(summary.cashTotalMinor)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Due / Credit Total</div>
              <div className="stat-value" style={{ color: summary.dueTotalMinor > 0 ? 'var(--danger)' : undefined }}>{fmt(summary.dueTotalMinor)}</div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="alert-error-inline">
            {error}
            <button onClick={fetchReconciliation} className="btn btn-secondary">
              Retry
            </button>
          </div>
        )}

        {/* Reconciliation Table */}
        <div className="card card-no-padding">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="cell-right">UPI ({'\u20B9'})</th>
                <th className="cell-right">Cash ({'\u20B9'})</th>
                <th className="cell-right">Due ({'\u20B9'})</th>
                <th className="cell-right">Refunds ({'\u20B9'})</th>
                <th className="cell-right">Net Total ({'\u20B9'})</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="td-center-muted">
                    Loading reconciliation data...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={<IndianRupee size={24} />}
                      title="No reconciliation data"
                      description="No payment data found for the selected date range. Try expanding the date range."
                    />
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.date}>
                    <td className="cell-bold">{fmtDateDDMMYYYY(row.date)}</td>
                    <td className="cell-mono-right">{fmt(row.upiMinor)}</td>
                    <td className="cell-mono-right">{fmt(row.cashMinor)}</td>
                    <td className="cell-mono-right" style={{ color: row.dueMinor > 0 ? 'var(--danger)' : undefined }}>{fmt(row.dueMinor)}</td>
                    <td className="cell-mono-right" style={{ color: row.refundsMinor > 0 ? 'var(--danger)' : undefined }}>{fmt(row.refundsMinor)}</td>
                    <td className="cell-mono-right-bold">{fmt(row.netTotalMinor)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Info Box */}
        <div className="info-box">
          <p className="info-box-text">
            <strong>Note:</strong> Each row shows one day's aggregate across all payment methods.
            "Due" includes BNPL and credit sales. Export CSV for offline reconciliation with your bank statement.
          </p>
        </div>
      </div>
    </>
  );
}
