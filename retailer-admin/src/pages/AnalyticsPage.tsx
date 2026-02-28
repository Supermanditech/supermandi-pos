// T-212: Sales Analytics Dashboard for Retailer Admin
// PRA-007: Added category breakdown via shared analyticsService
// STG-218: Replaced hardcoded hex colors with CSS variables for dark mode
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { fetchSalesAnalytics, SalesAnalytics, fetchProductAnalytics, ProductAnalytics } from '../api/store';
import Breadcrumb from '../components/Breadcrumb';
import { formatCurrency } from '../lib/formatters';

function getDefaultDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 6 * 86400000);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

export default function AnalyticsPage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { accessToken } = useAuth();
  const defaults = getDefaultDateRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [data, setData] = useState<SalesAnalytics | null>(null);
  const [categoryData, setCategoryData] = useState<ProductAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!accessToken) return;
    // REQ.AUDIT.W5.RETAILER.ANALYTICS-INVALID-DATE-RANGE-NO-BLOCK.001: skip API when range invalid
    if (from && to && from > to) return;
    setLoading(true);
    setError(null);
    try {
      const [salesResult, categoryResult] = await Promise.all([
        fetchSalesAnalytics(accessToken, from, to),
        fetchProductAnalytics(accessToken, from, to, 'category'),
      ]);
      setData(salesResult.data);
      setCategoryData(categoryResult.data);
    } catch (e: any) {
      setError(e.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [accessToken, from, to]);

  useEffect(() => { loadData(); }, [loadData]);

  // Find max daily sales for bar chart scaling
  const maxDailySales = data?.daily.reduce((max, d) => Math.max(max, d.totalSales), 0) || 1;

  // Payment breakdown percentages
  const paymentTotal = data ? (data.paymentBreakdown.cash + data.paymentBreakdown.upi + data.paymentBreakdown.credit) : 0;
  const cashPct = paymentTotal > 0 && data ? Math.round((data.paymentBreakdown.cash / paymentTotal) * 100) : 0;
  const upiPct = paymentTotal > 0 && data ? Math.round((data.paymentBreakdown.upi / paymentTotal) * 100) : 0;
  const creditPct = paymentTotal > 0 ? 100 - cashPct - upiPct : 0;

  return (
    <div>
      <Breadcrumb items={[{ label: 'Dashboard', path: `/s/${storeCode}` }, { label: 'Sales Analytics' }]} />

      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', gap: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)' }}>Sales Analytics</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="form-input"
            style={{ paddingInline: '0.75rem', paddingBlock: '0.5rem', fontSize: '0.875rem' }}
          />
          <span style={{ color: 'var(--text-muted)' }}>to</span>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="form-input"
            style={{ paddingInline: '0.75rem', paddingBlock: '0.5rem', fontSize: '0.875rem' }}
          />
        </div>
      </div>

      {/* RET-C4-010: Warn if date range is invalid */}
      {from && to && from > to && (
        <div className="alert-warning" style={{ marginBottom: '1rem' }}>
          Start date is after end date. Please adjust the date range.
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="alert-error" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p>{error}</p>
          <button aria-label="Retry loading analytics data" onClick={loadData} style={{ fontSize: '0.875rem', fontWeight: 500, color: '#b91c1c', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingBlock: '4rem' }}>
          <div style={{ borderRadius: '9999px', height: '2.5rem', width: '2.5rem', borderBottom: '2px solid var(--primary)', animation: 'spin 1s linear infinite' }} />
        </div>
      )}

      {/* Data */}
      {!loading && data && (
        <>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="card" style={{ padding: '1rem' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Total Sales</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', marginTop: '0.25rem' }}>{formatCurrency(data.totals.totalSales)}</p>
            </div>
            <div className="card" style={{ padding: '1rem' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Total Bills</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', marginTop: '0.25rem' }}>{data.totals.totalBills}</p>
            </div>
            <div className="card" style={{ padding: '1rem' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Avg Bill Value</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', marginTop: '0.25rem' }}>{formatCurrency(data.totals.averageBillValue)}</p>
            </div>
            <div className="card" style={{ padding: '1rem' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Days in Range</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', marginTop: '0.25rem' }}>{data.daily.length}</p>
            </div>
          </div>

          {/* Daily Sales Chart (simple bar chart using divs) */}
          <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
            <h2 style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '1rem' }}>Daily Sales Trend</h2>
            {data.daily.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', paddingBlock: '2rem' }}>No sales data for this period</p>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.25rem', height: '12rem' }}>
                {data.daily.map(d => {
                  const pct = maxDailySales > 0 ? (d.totalSales / maxDailySales) * 100 : 0;
                  const dateLabel = new Date(d.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                  return (
                    <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative' }}>
                      <div
                        style={{ width: '100%', background: '#3b82f6', borderRadius: '0.125rem 0.125rem 0 0', minHeight: '2px', transition: 'all 0.15s ease', height: `${Math.max(pct, 1)}%` }}
                        title={`${dateLabel}: ${formatCurrency(d.totalSales)} (${d.bills} bills)`}
                      />
                      {data.daily.length <= 14 && (
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '0.25rem', whiteSpace: 'nowrap' }}>{dateLabel}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Payment Breakdown + Top Products */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem', marginBottom: '1.5rem' }}>
            {/* Payment Breakdown */}
            <div className="card" style={{ padding: '1rem' }}>
              <h2 style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '1rem' }}>Payment Breakdown</h2>
              {paymentTotal === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', paddingBlock: '1rem' }}>No payment data</p>
              ) : (
                <>
                  {/* Stacked bar */}
                  <div style={{ display: 'flex', height: '1.5rem', borderRadius: '9999px', overflow: 'hidden', marginBottom: '1rem' }}>
                    {cashPct > 0 && <div style={{ background: '#22c55e', width: `${cashPct}%` }} />}
                    {upiPct > 0 && <div style={{ background: '#3b82f6', width: `${upiPct}%` }} />}
                    {creditPct > 0 && <div style={{ background: '#eab308', width: `${creditPct}%` }} />}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', color: 'var(--text)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ width: '0.75rem', height: '0.75rem', borderRadius: '9999px', background: '#22c55e', display: 'inline-block' }} />
                        Cash
                      </span>
                      <span style={{ fontWeight: 500 }}>{formatCurrency(data.paymentBreakdown.cash)} ({cashPct}%)</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ width: '0.75rem', height: '0.75rem', borderRadius: '9999px', background: '#3b82f6', display: 'inline-block' }} />
                        UPI
                      </span>
                      <span style={{ fontWeight: 500 }}>{formatCurrency(data.paymentBreakdown.upi)} ({upiPct}%)</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ width: '0.75rem', height: '0.75rem', borderRadius: '9999px', background: '#eab308', display: 'inline-block' }} />
                        Credit/Due
                      </span>
                      <span style={{ fontWeight: 500 }}>{formatCurrency(data.paymentBreakdown.credit)} ({creditPct}%)</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Top Products */}
            <div className="card" style={{ padding: '1rem' }}>
              <h2 style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '1rem' }}>Top Selling Products</h2>
              {data.topProducts.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', paddingBlock: '1rem' }}>No product data</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {data.topProducts.slice(0, 10).map((p, i) => (
                    <div key={p.productId || i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBlock: '0.25rem', borderBottom: i < Math.min(data.topProducts.length, 10) - 1 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: '1.25rem' }}>#{i + 1}</span>
                        <span style={{ fontSize: '0.875rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>{p.productName}</span>
                      </div>
                      <div style={{ textAlign: 'right', color: 'var(--text)' }}>
                        <p style={{ fontSize: '0.875rem', fontWeight: 500 }}>{formatCurrency(p.totalAmount)}</p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.qtySold} sold</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* PRA-007: Category Breakdown */}
          {categoryData && categoryData.salesByGroup.length > 0 && (
            <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
              <h2 style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '1rem' }}>Sales by Category</h2>
              {categoryData.missingFields.includes('variants.category') && (
                <p style={{ fontSize: '0.75rem', color: '#d97706', marginBottom: '0.75rem' }}>
                  Category data is incomplete — some products may appear as &quot;Uncategorized&quot;.
                </p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {categoryData.salesByGroup.map((cat, i) => {
                  const maxTotal = categoryData.salesByGroup[0]?.total_minor || 1;
                  const pct = Math.round((cat.total_minor / maxTotal) * 100);
                  return (
                    <div key={cat.group || i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', width: '8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }} title={cat.group}>
                        {cat.group}
                      </span>
                      <div style={{ flex: 1, background: 'var(--border)', borderRadius: '9999px', height: '1.25rem', overflow: 'hidden' }}>
                        <div
                          style={{ background: '#6366f1', height: '100%', borderRadius: '9999px', transition: 'all 0.15s ease', width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                      <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text)', width: '6rem', textAlign: 'right', flexShrink: 0 }}>
                        {formatCurrency(cat.total_minor)}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: '4rem', textAlign: 'right', flexShrink: 0 }}>
                        {cat.quantity} sold
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!loading && !error && data && data.totals.totalBills === 0 && (
        <div style={{ textAlign: 'center', paddingBlock: '3rem', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '1.125rem', fontWeight: 500 }}>No sales in this period</p>
          <p style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>Try selecting a different date range.</p>
        </div>
      )}
    </div>
  );
}
