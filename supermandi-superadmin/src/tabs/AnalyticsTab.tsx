// SA-001: Analytics tab extracted from App.tsx
// GCP-STG-0743: Revenue dashboard KPIs
import { useEffect, useState, useCallback } from "react";
import type { AnalyticsTabKey } from "../types";
import type {
  OverviewResponse,
  DevicesResponse,
  ProductsResponse,
  PurchasesResponse,
  ConsumerSalesResponse,
  ActivityResponse,
  DuesResponse,
  DashboardKpis,
} from "../api/analytics";
import { fetchDashboardKpis } from "../api/analytics";
import { isDeviceOnline } from "../ui/status";
import { formatDateTime, formatDate, formatCurrency } from "../lib/formatters";

interface AnalyticsTabProps {
  analyticsStoreId: string;
  setAnalyticsStoreId: (v: string) => void;
  analyticsFrom: string;
  setAnalyticsFrom: (v: string) => void;
  analyticsTo: string;
  setAnalyticsTo: (v: string) => void;
  refreshAnalytics: (tab: AnalyticsTabKey) => void;
  analyticsTab: AnalyticsTabKey;
  setAnalyticsTab: (tab: AnalyticsTabKey) => void;
  analyticsLoading: boolean;
  analyticsError: string;
  overviewData: OverviewResponse["overview"] | null;
  analyticsDevices: DevicesResponse | null;
  analyticsProducts: ProductsResponse["products"] | null;
  analyticsPurchases: PurchasesResponse["purchases"] | null;
  analyticsConsumerSales: ConsumerSalesResponse["consumer_sales"] | null;
  analyticsActivity: ActivityResponse["activity"] | null;
  analyticsDues: DuesResponse["dues"] | null;
  productsGroupBy: string;
  setProductsGroupBy: (v: string) => void;
}

export function AnalyticsTab({
  analyticsStoreId,
  setAnalyticsStoreId,
  analyticsFrom,
  setAnalyticsFrom,
  analyticsTo,
  setAnalyticsTo,
  refreshAnalytics,
  analyticsTab,
  setAnalyticsTab,
  analyticsLoading,
  analyticsError,
  overviewData,
  analyticsDevices,
  analyticsProducts,
  analyticsPurchases,
  analyticsConsumerSales,
  analyticsActivity,
  analyticsDues,
  productsGroupBy,
  setProductsGroupBy,
}: AnalyticsTabProps) {
  // R3-ANA-005: Re-fetch products data when groupBy changes
  useEffect(() => {
    if (analyticsTab === "products") {
      refreshAnalytics("products");
    }
  }, [productsGroupBy]); // eslint-disable-line react-hooks/exhaustive-deps

  // GCP-STG-0743: Revenue dashboard KPIs
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [kpisLoading, setKpisLoading] = useState(false);
  const loadKpis = useCallback(async () => {
    setKpisLoading(true);
    try {
      const resp = await fetchDashboardKpis();
      setKpis(resp.data);
    } catch { /* ignore */ }
    setKpisLoading(false);
  }, []);
  useEffect(() => { void loadKpis(); }, [loadKpis]);

  return (
    <>
    {/* GCP-STG-0743: Revenue KPI Banner */}
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="cardHeader">
        <div className="cardTitle">Revenue Dashboard</div>
        <button onClick={() => void loadKpis()} disabled={kpisLoading} style={{ fontSize: 13 }}>
          {kpisLoading ? "Loading..." : "\u21BB Refresh"}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, padding: '8px 0' }}>
        {[
          { label: "Today GMV", value: kpis ? formatCurrency(kpis.todayGmv) : "..." },
          { label: "Month GMV", value: kpis ? formatCurrency(kpis.monthGmv) : "..." },
          { label: "Commission", value: kpis ? formatCurrency(kpis.commissionEarned) : "..." },
          { label: "Active Stores", value: kpis ? `${kpis.activeStores} / ${kpis.totalStores}` : "..." },
          { label: "Active Suppliers", value: kpis ? `${kpis.activeSuppliers} / ${kpis.totalSuppliers}` : "..." },
        ].map(item => (
          <div key={item.label} style={{ textAlign: 'center', padding: 8, background: 'var(--bg-secondary, #f8fafc)', borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary, #1e293b)' }}>{item.value}</div>
          </div>
        ))}
      </div>
    </section>

    <section className="card">
      <div className="cardHeader">
        <div>
          <div className="cardTitle">Analytics</div>
          <div className="muted">POS + Consumer + Purchases (admin-only)</div>
        </div>
        <span className="sa-badge-info sa-text-xs" style={{ padding: "3px 10px", borderRadius: 6, fontWeight: 600, whiteSpace: "nowrap" }}>
          Live Data
        </span>
      </div>

      <div className="tableWrap" style={{ paddingTop: 0 }}>
        <div className="controls" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <div className="control">
            <label htmlFor="filter-analytics-store">Store ID (optional)</label>
            <input
              id="filter-analytics-store"
              value={analyticsStoreId}
              onChange={(e) => setAnalyticsStoreId(e.target.value)}
              placeholder="UUID or store code"
            />
          </div>
          <div className="control">
            <label htmlFor="filter-analytics-from">From</label>
            <input id="filter-analytics-from" type="date" value={analyticsFrom} onChange={(e) => setAnalyticsFrom(e.target.value)} />
          </div>
          <div className="control">
            <label htmlFor="filter-analytics-to">To</label>
            <input id="filter-analytics-to" type="date" value={analyticsTo} onChange={(e) => setAnalyticsTo(e.target.value)} />
          </div>
          <div className="control">
            <label>&nbsp;</label>
            <button onClick={() => refreshAnalytics(analyticsTab)} disabled={analyticsLoading} aria-label="Refresh">
              {analyticsLoading ? "Refreshing..." : "\u21BB Refresh"}
            </button>
          </div>
        </div>

        <div className="subTabs" style={{ marginTop: 12, overflowX: "auto", whiteSpace: "nowrap" }}>
          {(["overview", "devices", "products", "payments", "purchases", "consumer", "activity", "dues"] as AnalyticsTabKey[]).map((key) => (
            <button
              key={key}
              className={analyticsTab === key ? "tab tabActive" : "tab"}
              onClick={() => setAnalyticsTab(key)}
            >
              {key === "consumer" ? "Consumer Sales" : key === "payments" ? "Payments & Dues" : key === "activity" ? "Activity Logs" : key === "dues" ? "Dues Tracking" : key[0].toUpperCase() + key.slice(1)}
            </button>
          ))}
        </div>

        {analyticsError && <div className="banner sa-mt-12" role="alert">{analyticsError}</div>}

        {/* UNMAPPED.041: Loading skeleton when data is null and loading */}
        {analyticsLoading && (
          <div className="sa-mt-12 sa-p-24 sa-text-center">
            <div className="sa-spinner" />
            <div className="muted sa-mt-8">Loading analytics...</div>
          </div>
        )}

        {/* UNMAPPED.041: Empty state when data is null and not loading */}
        {!analyticsLoading && !analyticsError && analyticsTab === "overview" && !overviewData && (
          <div className="empty sa-mt-12 sa-p-24">No overview data available. Click Refresh to load.</div>
        )}
        {!analyticsLoading && !analyticsError && analyticsTab === "devices" && !analyticsDevices && (
          <div className="empty sa-mt-12 sa-p-24">No device data available. Click Refresh to load.</div>
        )}
        {!analyticsLoading && !analyticsError && analyticsTab === "products" && !analyticsProducts && (
          <div className="empty sa-mt-12 sa-p-24">No product data available. Click Refresh to load.</div>
        )}
        {!analyticsLoading && !analyticsError && analyticsTab === "payments" && !overviewData && (
          <div className="empty sa-mt-12 sa-p-24">No payment data available. Click Refresh to load.</div>
        )}
        {!analyticsLoading && !analyticsError && analyticsTab === "purchases" && !analyticsPurchases && (
          <div className="empty sa-mt-12 sa-p-24">No purchase data available. Click Refresh to load.</div>
        )}
        {!analyticsLoading && !analyticsError && analyticsTab === "consumer" && !analyticsConsumerSales && (
          <div className="empty sa-mt-12 sa-p-24">No consumer sales data available. Click Refresh to load.</div>
        )}
        {!analyticsLoading && !analyticsError && analyticsTab === "activity" && !analyticsActivity && (
          <div className="empty sa-mt-12 sa-p-24">No activity data available. Click Refresh to load.</div>
        )}
        {!analyticsLoading && !analyticsError && analyticsTab === "dues" && !analyticsDues && (
          <div className="empty sa-mt-12 sa-p-24">No dues data available. Click Refresh to load.</div>
        )}

        {analyticsTab === "overview" && overviewData && (
          <div className="sa-mt-12" style={{ display: "grid", gap: 12 }}>
            <div className="analyticsGrid">
              <div className="analyticsCard">
                <div className="analyticsLabel">Sales Total (POS)</div>
                <div className="analyticsValue">{formatCurrency(overviewData.sales_total.pos_minor)}</div>
              </div>
              <div className="analyticsCard">
                <div className="analyticsLabel">Sales Total (Consumer)</div>
                <div className="analyticsValue">{formatCurrency(overviewData.sales_total.consumer_minor)}</div>
              </div>
              <div className="analyticsCard">
                <div className="analyticsLabel">Sales Total (All)</div>
                <div className="analyticsValue">{formatCurrency(overviewData.sales_total.total_minor)}</div>
              </div>
              <div className="analyticsCard">
                <div className="analyticsLabel">Collections Total</div>
                <div className="analyticsValue">{formatCurrency(overviewData.collections_total_minor)}</div>
              </div>
              <div className="analyticsCard">
                <div className="analyticsLabel">New Products (Retailer)</div>
                <div className="analyticsValue">{overviewData.new_products_created_count}</div>
              </div>
              <div className="analyticsCard">
                <div className="analyticsLabel">Devices Online / Offline</div>
                <div className="analyticsValue">
                  {overviewData.devices.online} / {overviewData.devices.offline}
                </div>
                <div className="muted">Pending outbox: {overviewData.devices.pending_outbox_total}</div>
              </div>
            </div>

            <div className="analyticsGrid">
              <div className="analyticsCard">
                <div className="analyticsLabel">Payment Split (Cash / UPI / Due)</div>
                <div className="analyticsValue">
                  {formatCurrency(overviewData.payment_split_minor.cash)} / {formatCurrency(overviewData.payment_split_minor.upi)} / {formatCurrency(overviewData.payment_split_minor.due)}
                </div>
              </div>
              <div className="analyticsCard">
                <div className="analyticsLabel">Due Outstanding</div>
                <div className="analyticsValue">{formatCurrency(overviewData.due_outstanding.total_minor)}</div>
                <div className="muted">
                  {overviewData.due_outstanding.buckets.map((b: any) => `${b.label}: ${formatCurrency(b.total_minor)}`).join(" | ")}
                </div>
              </div>
              <div className="analyticsCard">
                <div className="analyticsLabel">Profit (Gross)</div>
                {overviewData.profit ? (
                  <>
                    <div className="analyticsValue">{formatCurrency(overviewData.profit.gross_profit_minor)}</div>
                    <div className="muted">
                      Margin: {overviewData.profit.margin_percent ?? 0}% | Confidence: {overviewData.profit.profit_confidence}
                    </div>
                    {overviewData.profit.missing_cost_items_count > 0 && (
                      <div className="muted">Missing cost items: {overviewData.profit.missing_cost_items_count}</div>
                    )}
                  </>
                ) : (
                  <div className="muted">
                    Profit unavailable. Missing: {(overviewData.profit_missing_fields ?? []).join(", ") || "purchase data"}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {analyticsTab === "payments" && overviewData && (
          <div className="sa-mt-12">
            <div className="analyticsGrid">
              <div className="analyticsCard">
                <div className="analyticsLabel">Payment Split (Cash / UPI / Due)</div>
                <div className="analyticsValue">
                  {formatCurrency(overviewData.payment_split_minor.cash)} / {formatCurrency(overviewData.payment_split_minor.upi)} / {formatCurrency(overviewData.payment_split_minor.due)}
                </div>
              </div>
              <div className="analyticsCard">
                <div className="analyticsLabel">Due Outstanding</div>
                <div className="analyticsValue">{formatCurrency(overviewData.due_outstanding.total_minor)}</div>
              </div>
            </div>
            <div className="cardHeader" style={{ paddingTop: 0 }}>
              <div className="cardTitle">Due aging buckets</div>
            </div>
            <div className="tableWrap" style={{ paddingTop: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Bucket</th>
                    <th>Total</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {overviewData.due_outstanding.buckets.map((b: any) => (
                    <tr key={b.label}>
                      <td>{b.label}</td>
                      <td className="mono">{formatCurrency(b.total_minor)}</td>
                      <td className="mono">{b.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {analyticsTab === "devices" && analyticsDevices && (
          <div className="sa-mt-12">
            <div className="tableWrap" style={{ paddingTop: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Pending Outbox</th>
                    <th>Sales (count/value)</th>
                    <th>Collections (count/value)</th>
                    <th>Offline Sales</th>
                    <th>Last Seen</th>
                    <th>Last Sync</th>
                  </tr>
                </thead>
                <tbody>
                  {analyticsDevices.devices.map((d) => {
                    const online = isDeviceOnline(d.last_seen_online);
                    return (
                      <tr key={d.device_id}>
                        <td>{d.label ?? d.device_id}</td>
                        <td>{d.device_type ?? "Unknown"}</td>
                        <td>{online ? "Online" : "Offline"} / {d.active ? "Active" : "Inactive"}</td>
                        <td className="mono">{d.pending_outbox_count}</td>
                        <td className="mono">{d.sales_count} / {formatCurrency(d.sales_total_minor)}</td>
                        <td className="mono">{d.collections_count} / {formatCurrency(d.collections_total_minor)}</td>
                        <td className="mono">{d.offline_sales_count}</td>
                        <td className="mono">{d.last_seen_online ? formatDateTime(d.last_seen_online) : "-"}</td>
                        <td className="mono">{d.last_sync_at ? formatDateTime(d.last_sync_at) : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {analyticsTab === "products" && analyticsProducts && (
          <div className="sa-mt-12">
            <div className="controls" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
              <div className="control">
                <label htmlFor="filter-analytics-groupby">Group By</label>
                <select id="filter-analytics-groupby" value={productsGroupBy} onChange={(e) => setProductsGroupBy(e.target.value)} className="selectSmall">
                  <option value="day">Day</option>
                  <option value="hour">Hour</option>
                  <option value="category">Category</option>
                </select>
              </div>
            </div>

            <div className="cardHeader" style={{ paddingTop: 0 }}>
              <div className="cardTitle">Top Products</div>
            </div>
            <div className="tableWrap" style={{ paddingTop: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Barcode</th>
                    <th>Source</th>
                    <th>Qty</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {analyticsProducts.top_products.map((p) => (
                    <tr key={p.product_id}>
                      <td>{p.name}</td>
                      <td className="mono">{p.barcode}</td>
                      <td>{p.source}</td>
                      <td className="mono">{p.quantity}</td>
                      <td className="mono">{formatCurrency(p.total_minor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="cardHeader" style={{ paddingTop: 0 }}>
              <div className="cardTitle">New Products (Retailer)</div>
              <div className="muted">Count: {analyticsProducts.new_products_created_count}</div>
            </div>
            <div className="tableWrap" style={{ paddingTop: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Barcode</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {analyticsProducts.new_products_created.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td className="mono">{p.barcode}</td>
                      <td className="mono">{p.created_at ? formatDateTime(p.created_at) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {analyticsTab === "purchases" && analyticsPurchases && (
          <div className="sa-mt-12">
            <div className="analyticsGrid">
              <div className="analyticsCard">
                <div className="analyticsLabel">Purchases Total</div>
                <div className="analyticsValue">{formatCurrency(analyticsPurchases.total_minor)}</div>
              </div>
            </div>

            <div className="cardHeader" style={{ paddingTop: 0 }}>
              <div className="cardTitle">Vendor Breakdown</div>
            </div>
            <div className="tableWrap" style={{ paddingTop: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {analyticsPurchases.vendor_breakdown.map((v) => (
                    <tr key={v.supplier}>
                      <td>{v.supplier}</td>
                      <td className="mono">{formatCurrency(v.total_minor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="cardHeader" style={{ paddingTop: 0 }}>
              <div className="cardTitle">SKU Cost Summary</div>
            </div>
            <div className="tableWrap" style={{ paddingTop: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>SKU/Product</th>
                    <th>Qty</th>
                    <th>Avg Cost</th>
                    <th>Last Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {analyticsPurchases.sku_cost_summary.map((s, idx) => (
                    <tr key={`${s.product_id ?? s.sku ?? "sku"}-${idx}`}>
                      <td className="mono">{s.sku ?? s.product_id ?? "unknown"}</td>
                      <td className="mono">{s.quantity}</td>
                      <td className="mono">{formatCurrency(s.avg_cost_minor)}</td>
                      <td className="mono">{s.last_cost_minor ? formatCurrency(s.last_cost_minor) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* SA-P0-004: Stock-In Breakdown by Supplier Type */}
            {analyticsPurchases.stock_in_breakdown && analyticsPurchases.stock_in_breakdown.total_entries > 0 && (
              <>
                <div className="cardHeader" style={{ paddingTop: 0 }}>
                  <div className="cardTitle">
                    Stock-In Breakdown ({analyticsPurchases.stock_in_breakdown.total_entries} entries — {formatCurrency(analyticsPurchases.stock_in_breakdown.total_amount_minor)})
                  </div>
                </div>
                <div className="tableWrap" style={{ paddingTop: 0 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Supplier</th>
                        <th>GSTIN</th>
                        <th>Entries</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsPurchases.stock_in_breakdown.by_type.flatMap((t) =>
                        t.suppliers.map((s, idx) => (
                          <tr key={`${t.type}-${s.name}-${idx}`}>
                            {idx === 0 ? (
                              <td rowSpan={t.suppliers.length} className="sa-fw-600" style={{ verticalAlign: "top" }}>
                                {t.type === "verified" ? "Verified" : t.type === "walk_in" ? "Walk-in" : "Unknown"}
                              </td>
                            ) : null}
                            <td>{s.name}</td>
                            <td className="mono">{s.gstin ?? "-"}</td>
                            <td className="mono">{s.count}</td>
                            <td className="mono">{formatCurrency(s.total_minor)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {analyticsTab === "consumer" && analyticsConsumerSales && (
          <div className="sa-mt-12">
            <div className="analyticsGrid">
              <div className="analyticsCard">
                <div className="analyticsLabel">Consumer Sales Total</div>
                <div className="analyticsValue">{formatCurrency(analyticsConsumerSales.total_minor)}</div>
              </div>
              <div className="analyticsCard">
                <div className="analyticsLabel">Payment Split (Cash / UPI / Due)</div>
                <div className="analyticsValue">
                  {formatCurrency(analyticsConsumerSales.payment_split_minor.cash)} / {formatCurrency(analyticsConsumerSales.payment_split_minor.upi)} / {formatCurrency(analyticsConsumerSales.payment_split_minor.due)}
                </div>
              </div>
            </div>
            <div className="cardHeader" style={{ paddingTop: 0 }}>
              <div className="cardTitle">Order Status</div>
            </div>
            <div className="tableWrap" style={{ paddingTop: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {analyticsConsumerSales.status_counts.map((s) => (
                    <tr key={s.status}>
                      <td>{s.status}</td>
                      <td className="mono">{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* P2-SADM-001: Activity Logs */}
        {analyticsTab === "activity" && analyticsActivity && (
          <div className="sa-mt-12">
            <div className="cardHeader" style={{ paddingTop: 0 }}>
              <div className="cardTitle">Activity Logs</div>
              <div className="muted">
                {analyticsActivity.range.from.slice(0, 10)} to {analyticsActivity.range.to.slice(0, 10)} (grouped by {analyticsActivity.groupBy})
              </div>
            </div>
            <div className="tableWrap" style={{ paddingTop: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Time Bucket</th>
                    <th>Scans</th>
                    <th>Sales</th>
                    <th>Collections</th>
                    <th>New Products</th>
                    <th>Offline Synced</th>
                  </tr>
                </thead>
                <tbody>
                  {analyticsActivity.buckets.length === 0 ? (
                    <tr><td colSpan={6} className="empty">No activity in this period.</td></tr>
                  ) : (
                    analyticsActivity.buckets.map((b) => (
                      <tr key={b.bucket}>
                        <td className="mono">{formatDateTime(b.bucket)}</td>
                        <td className="mono">{b.scans}</td>
                        <td className="mono">{b.sales}</td>
                        <td className="mono">{b.collections}</td>
                        <td className="mono">{b.new_products_created}</td>
                        <td className="mono">{b.offline_events_synced}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* P2-SADM-002: Dues Tracking */}
        {analyticsTab === "dues" && analyticsDues && (
          <div className="sa-mt-12">
            <div className="analyticsGrid">
              <div className="analyticsCard">
                <div className="analyticsLabel">Outstanding Total</div>
                <div className="analyticsValue">{formatCurrency(analyticsDues.outstanding_total_minor)}</div>
              </div>
              <div className="analyticsCard">
                <div className="analyticsLabel">0-1 Days</div>
                <div className="analyticsValue">{formatCurrency(analyticsDues.aging.d0_1)}</div>
              </div>
              <div className="analyticsCard">
                <div className="analyticsLabel">2-7 Days</div>
                <div className="analyticsValue">{formatCurrency(analyticsDues.aging.d2_7)}</div>
              </div>
              <div className="analyticsCard">
                <div className="analyticsLabel">8-30 Days</div>
                <div className="analyticsValue">{formatCurrency(analyticsDues.aging.d8_30)}</div>
              </div>
              <div className="analyticsCard">
                <div className="analyticsLabel">30+ Days</div>
                <div className="analyticsValue">{formatCurrency(analyticsDues.aging.d30_plus)}</div>
              </div>
            </div>
            <div className="cardHeader" style={{ paddingTop: 0 }}>
              <div className="cardTitle">Outstanding Dues ({analyticsDues.total} records)</div>
            </div>
            <div className="tableWrap" style={{ paddingTop: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Sale ID</th>
                    <th>Customer</th>
                    <th>Amount</th>
                    <th>Created</th>
                    <th>Age (Days)</th>
                  </tr>
                </thead>
                <tbody>
                  {analyticsDues.dues.length === 0 ? (
                    <tr><td colSpan={5} className="empty">No outstanding dues.</td></tr>
                  ) : (
                    analyticsDues.dues.map((d) => (
                      <tr key={d.sale_id}>
                        <td className="mono">{d.sale_id ? d.sale_id.slice(0, 8) : "-"}</td>
                        <td>{d.customer_name ?? "-"}</td>
                        <td className="mono">{formatCurrency(d.amount_minor)}</td>
                        <td className="mono">{formatDate(d.created_at)}</td>
                        <td className="mono">{d.age_days}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
    </>
  );
}
