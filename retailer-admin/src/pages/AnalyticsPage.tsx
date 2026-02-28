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

      <div className="anly-header">
        <h1 className="anly-title">Sales Analytics</h1>
        <div className="anly-date-range">
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="form-input anly-date-input"
          />
          <span className="text-muted">to</span>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="form-input anly-date-input"
          />
        </div>
      </div>

      {/* RET-C4-010: Warn if date range is invalid */}
      {from && to && from > to && (
        <div className="alert-warning grid-mb">
          Start date is after end date. Please adjust the date range.
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="alert-error-inline">
          <p>{error}</p>
          <button aria-label="Retry loading analytics data" onClick={loadData} className="anly-retry-btn">Retry</button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="anly-loading">
          <div className="anly-spinner" />
        </div>
      )}

      {/* Data */}
      {!loading && data && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-4 grid-mb-lg">
            <div className="stat-card">
              <div className="stat-label">Total Sales</div>
              <div className="stat-value">{formatCurrency(data.totals.totalSales)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Bills</div>
              <div className="stat-value">{data.totals.totalBills}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Avg Bill Value</div>
              <div className="stat-value">{formatCurrency(data.totals.averageBillValue)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Days in Range</div>
              <div className="stat-value">{data.daily.length}</div>
            </div>
          </div>

          {/* Daily Sales Chart (simple bar chart using divs) */}
          <div className="card anly-card-mb">
            <h2 className="anly-section-title">Daily Sales Trend</h2>
            {data.daily.length === 0 ? (
              <p className="text-center-muted">No sales data for this period</p>
            ) : (
              <div className="anly-chart-container">
                {data.daily.map(d => {
                  const pct = maxDailySales > 0 ? (d.totalSales / maxDailySales) * 100 : 0;
                  const dateLabel = new Date(d.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                  return (
                    <div key={d.date} className="anly-chart-col">
                      <div
                        className="anly-chart-bar"
                        style={{ height: `${Math.max(pct, 1)}%` }}
                        title={`${dateLabel}: ${formatCurrency(d.totalSales)} (${d.bills} bills)`}
                      />
                      {data.daily.length <= 14 && (
                        <span className="anly-chart-label">{dateLabel}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Payment Breakdown + Top Products */}
          <div className="grid grid-2 grid-mb-lg">
            {/* Payment Breakdown */}
            <div className="card anly-card">
              <h2 className="anly-section-title">Payment Breakdown</h2>
              {paymentTotal === 0 ? (
                <p className="text-center-muted">No payment data</p>
              ) : (
                <>
                  {/* Stacked bar */}
                  <div className="anly-pay-bar">
                    {cashPct > 0 && <div className="anly-pay-dot--cash" style={{ width: `${cashPct}%` }} />}
                    {upiPct > 0 && <div className="anly-pay-dot--upi" style={{ width: `${upiPct}%` }} />}
                    {creditPct > 0 && <div className="anly-pay-dot--credit" style={{ width: `${creditPct}%` }} />}
                  </div>
                  <div className="anly-pay-list">
                    <div className="anly-pay-row">
                      <span className="anly-pay-label">
                        <span className="anly-pay-dot anly-pay-dot--cash" />
                        Cash
                      </span>
                      <span className="anly-pay-amount">{formatCurrency(data.paymentBreakdown.cash)} ({cashPct}%)</span>
                    </div>
                    <div className="anly-pay-row">
                      <span className="anly-pay-label">
                        <span className="anly-pay-dot anly-pay-dot--upi" />
                        UPI
                      </span>
                      <span className="anly-pay-amount">{formatCurrency(data.paymentBreakdown.upi)} ({upiPct}%)</span>
                    </div>
                    <div className="anly-pay-row">
                      <span className="anly-pay-label">
                        <span className="anly-pay-dot anly-pay-dot--credit" />
                        Credit/Due
                      </span>
                      <span className="anly-pay-amount">{formatCurrency(data.paymentBreakdown.credit)} ({creditPct}%)</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Top Products */}
            <div className="card anly-card">
              <h2 className="anly-section-title">Top Selling Products</h2>
              {data.topProducts.length === 0 ? (
                <p className="text-center-muted">No product data</p>
              ) : (
                <div className="anly-top-list">
                  {data.topProducts.slice(0, 10).map((p, i) => (
                    <div key={p.productId || i} className="anly-top-row" style={{ borderBottom: i < Math.min(data.topProducts.length, 10) - 1 ? '1px solid var(--border)' : 'none' }}>
                      <div className="anly-top-left">
                        <span className="anly-top-rank">#{i + 1}</span>
                        <span className="anly-top-name">{p.productName}</span>
                      </div>
                      <div className="anly-top-right">
                        <p className="anly-top-amount">{formatCurrency(p.totalAmount)}</p>
                        <p className="anly-top-qty">{p.qtySold} sold</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* PRA-007: Category Breakdown */}
          {categoryData && categoryData.salesByGroup.length > 0 && (
            <div className="card anly-card-mb">
              <h2 className="anly-section-title">Sales by Category</h2>
              {categoryData.missingFields.includes('variants.category') && (
                <p className="anly-cat-warning">
                  Category data is incomplete — some products may appear as &quot;Uncategorized&quot;.
                </p>
              )}
              <div className="anly-cat-list">
                {categoryData.salesByGroup.map((cat, i) => {
                  const maxTotal = categoryData.salesByGroup[0]?.total_minor || 1;
                  const pct = Math.round((cat.total_minor / maxTotal) * 100);
                  return (
                    <div key={cat.group || i} className="anly-cat-row">
                      <span className="anly-cat-label" title={cat.group}>
                        {cat.group}
                      </span>
                      <div className="anly-cat-track">
                        <div
                          className="anly-cat-fill"
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                      <span className="anly-cat-amount">
                        {formatCurrency(cat.total_minor)}
                      </span>
                      <span className="anly-cat-qty">
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
        <div className="anly-empty">
          <p className="anly-empty-title">No sales in this period</p>
          <p className="anly-empty-hint">Try selecting a different date range.</p>
        </div>
      )}
    </div>
  );
}
