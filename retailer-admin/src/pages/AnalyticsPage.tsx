// T-212: Sales Analytics Dashboard for Retailer Admin
// PRA-007: Added category breakdown via shared analyticsService
import { useState, useEffect, useCallback } from 'react';
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
  const cashPct = paymentTotal > 0 ? Math.round((data!.paymentBreakdown.cash / paymentTotal) * 100) : 0;
  const upiPct = paymentTotal > 0 ? Math.round((data!.paymentBreakdown.upi / paymentTotal) * 100) : 0;
  const creditPct = paymentTotal > 0 ? 100 - cashPct - upiPct : 0;

  return (
    <div>
      <Breadcrumb items={[{ label: 'Dashboard', path: '.' }, { label: 'Sales Analytics' }]} />

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold text-slate-800">Sales Analytics</h1>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <span className="text-slate-400">to</span>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center justify-between">
          <p className="text-red-800">{error}</p>
          <button onClick={loadData} className="text-sm font-medium text-red-700 underline">Retry</button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      )}

      {/* Data */}
      {!loading && data && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-sm text-slate-500">Total Sales</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{formatCurrency(data.totals.totalSales)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-sm text-slate-500">Total Bills</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{data.totals.totalBills}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-sm text-slate-500">Avg Bill Value</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{formatCurrency(data.totals.averageBillValue)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-sm text-slate-500">Days in Range</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{data.daily.length}</p>
            </div>
          </div>

          {/* Daily Sales Chart (simple bar chart using divs) */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
            <h2 className="font-semibold text-slate-700 mb-4">Daily Sales Trend</h2>
            {data.daily.length === 0 ? (
              <p className="text-slate-400 text-center py-8">No sales data for this period</p>
            ) : (
              <div className="flex items-end gap-1 h-48">
                {data.daily.map(d => {
                  const pct = maxDailySales > 0 ? (d.totalSales / maxDailySales) * 100 : 0;
                  const dateLabel = new Date(d.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                      <div
                        className="w-full bg-blue-500 rounded-t-sm min-h-[2px] transition-all group-hover:bg-blue-600"
                        style={{ height: `${Math.max(pct, 1)}%` }}
                        title={`${dateLabel}: ${formatCurrency(d.totalSales)} (${d.bills} bills)`}
                      />
                      {data.daily.length <= 14 && (
                        <span className="text-[10px] text-slate-400 mt-1 whitespace-nowrap">{dateLabel}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Payment Breakdown + Top Products */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Payment Breakdown */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h2 className="font-semibold text-slate-700 mb-4">Payment Breakdown</h2>
              {paymentTotal === 0 ? (
                <p className="text-slate-400 text-center py-4">No payment data</p>
              ) : (
                <>
                  {/* Stacked bar */}
                  <div className="flex h-6 rounded-full overflow-hidden mb-4">
                    {cashPct > 0 && <div className="bg-green-500" style={{ width: `${cashPct}%` }} />}
                    {upiPct > 0 && <div className="bg-blue-500" style={{ width: `${upiPct}%` }} />}
                    {creditPct > 0 && <div className="bg-yellow-500" style={{ width: `${creditPct}%` }} />}
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
                        Cash
                      </span>
                      <span className="font-medium">{formatCurrency(data.paymentBreakdown.cash)} ({cashPct}%)</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
                        UPI
                      </span>
                      <span className="font-medium">{formatCurrency(data.paymentBreakdown.upi)} ({upiPct}%)</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" />
                        Credit/Due
                      </span>
                      <span className="font-medium">{formatCurrency(data.paymentBreakdown.credit)} ({creditPct}%)</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Top Products */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h2 className="font-semibold text-slate-700 mb-4">Top Selling Products</h2>
              {data.topProducts.length === 0 ? (
                <p className="text-slate-400 text-center py-4">No product data</p>
              ) : (
                <div className="space-y-2">
                  {data.topProducts.slice(0, 10).map((p, i) => (
                    <div key={p.productId || i} className="flex items-center justify-between py-1 border-b border-slate-100 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 w-5">#{i + 1}</span>
                        <span className="text-sm text-slate-700 truncate max-w-[200px]">{p.productName}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{formatCurrency(p.totalAmount)}</p>
                        <p className="text-xs text-slate-400">{p.qtySold} sold</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* PRA-007: Category Breakdown */}
          {categoryData && categoryData.salesByGroup.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
              <h2 className="font-semibold text-slate-700 mb-4">Sales by Category</h2>
              {categoryData.missingFields.includes('variants.category') && (
                <p className="text-xs text-amber-600 mb-3">
                  Category data is incomplete — some products may appear as &quot;Uncategorized&quot;.
                </p>
              )}
              <div className="space-y-2">
                {categoryData.salesByGroup.map((cat, i) => {
                  const maxTotal = categoryData.salesByGroup[0]?.total_minor || 1;
                  const pct = Math.round((cat.total_minor / maxTotal) * 100);
                  return (
                    <div key={cat.group || i} className="flex items-center gap-3">
                      <span className="text-sm text-slate-600 w-32 truncate shrink-0" title={cat.group}>
                        {cat.group}
                      </span>
                      <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                        <div
                          className="bg-indigo-500 h-full rounded-full transition-all"
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-slate-700 w-24 text-right shrink-0">
                        {formatCurrency(cat.total_minor)}
                      </span>
                      <span className="text-xs text-slate-400 w-16 text-right shrink-0">
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
        <div className="text-center py-12 text-slate-500">
          <p className="text-lg font-medium">No sales in this period</p>
          <p className="text-sm mt-1">Try selecting a different date range.</p>
        </div>
      )}
    </div>
  );
}
