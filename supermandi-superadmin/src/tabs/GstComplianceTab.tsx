// T-235: SuperAdmin GST Compliance Dashboard Tab
import { useCallback, useEffect, useState } from "react";
import { fetchGstStoresOverview, fetchGstSummary, exportGstr1, type GstStoresOverviewResponse, type GstSummary } from "../api/gstCompliance";

function formatCurrency(minor: number): string {
  return "\u20B9" + (minor / 100).toFixed(2);
}

function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function GstComplianceTab() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [overview, setOverview] = useState<GstStoresOverviewResponse | null>(null);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [storeSummary, setStoreSummary] = useState<GstSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchGstStoresOverview(month);
      setOverview(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load GST overview");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  const loadStoreDetail = async (storeId: string) => {
    setSelectedStore(storeId);
    setDetailLoading(true);
    try {
      const data = await fetchGstSummary(storeId, month);
      setStoreSummary(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load store GST detail");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleExport = async (storeId: string) => {
    setExporting(true);
    try {
      const blob = await exportGstr1(storeId, month);
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = `GSTR1_${storeId}_${month}.json`;
        a.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="sa-p-24">
      <div className="sa-flex-between sa-mb-20">
        <div>
          <h2 className="sa-text-xl sa-fw-700">GST Compliance Dashboard</h2>
          <p className="sa-text-md sa-text-muted sa-mt-4" style={{ margin: 0 }}>Monthly GST summary, filing status, and GSTR-1 export</p>
        </div>
        <div className="sa-flex sa-gap-8">
          <label htmlFor="filter-gst-month" className="sa-sr-only">Month</label>
          <input
            id="filter-gst-month"
            type="month"
            className="sa-input"
            aria-label="Select month"
            value={month}
            onChange={(e) => { setMonth(e.target.value); setSelectedStore(null); setStoreSummary(null); }}
          />
          <button className="sa-btn-ghost-sm" onClick={loadOverview}>
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="sa-alert-error sa-mb-16">{error}</div>}

      {/* Totals summary */}
      {overview && (
        <div className="sa-grid-4 sa-mb-20">
          {[
            { label: "Total Sales", value: formatCurrency(overview.totals.totalSales), color: "var(--color-primary)" },
            { label: "Total GST Collected", value: formatCurrency(overview.totals.totalTax), color: "var(--color-success)" },
            { label: "Total Invoices", value: String(overview.totals.totalInvoices), color: "var(--color-accent)" },
            { label: "Filing Deadline", value: overview.filingDeadline, color: "var(--color-warning)" },
          ].map((card, i) => (
            <div key={i} className="sa-accent-card" style={{ borderLeftColor: card.color }}>
              <div className="sa-stat-label">{card.label}</div>
              <div className="sa-stat-value sa-mt-4">{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* UNMAPPED.043: Loading skeleton for initial overview fetch */}
      {loading && !overview && (
        <div className="sa-grid-4 sa-mb-20">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="sa-stat-card sa-bg-surface-alt">
              <div className="skeleton sa-mb-8" style={{ height: 12, width: "60%" }} />
              <div className="skeleton" style={{ height: 20, width: "80%" }} />
            </div>
          ))}
        </div>
      )}

      {/* Stores table */}
      {loading ? (
        <div className="sa-p-24 skeletonTable">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="skeletonRow">
              <div className="skeleton skeletonCell" style={{ width: "25%" }} />
              <div className="skeleton skeletonCell" style={{ width: "20%" }} />
              <div className="skeleton skeletonCell" style={{ width: "15%" }} />
              <div className="skeleton skeletonCell" style={{ width: "15%" }} />
              <div className="skeleton skeletonCell" style={{ width: "10%" }} />
            </div>
          ))}
        </div>
      ) : overview && overview.stores.length > 0 ? (
        <table className="table">
          <thead>
            <tr>
              <th className="sa-th">Store</th>
              <th className="sa-th">GSTIN</th>
              <th className="sa-th sa-th--right">Sales</th>
              <th className="sa-th sa-th--right">Tax</th>
              <th className="sa-th sa-th--right">Invoices</th>
              <th className="sa-th" style={{ textAlign: "center" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {overview.stores.map((s) => (
              <tr key={s.storeId}>
                <td className="sa-td">
                  <div className="sa-fw-500">{s.storeName}</div>
                  <div className="sa-text-sm sa-text-muted">{s.storeCode}</div>
                </td>
                <td className="sa-td sa-td--mono" style={{ color: s.gstin ? "var(--color-text-secondary)" : "var(--color-border)" }}>
                  {s.gstin || "Not registered"}
                </td>
                <td className="sa-td sa-td--right">{formatCurrency(s.totalSales)}</td>
                <td className="sa-td sa-td--right">{formatCurrency(s.totalTax)}</td>
                <td className="sa-td sa-td--right sa-text-muted">{s.invoiceCount}</td>
                <td className="sa-td" style={{ textAlign: "center" }}>
                  <button
                    className="sa-btn-xs sa-badge-info"
                    onClick={() => loadStoreDetail(s.storeId)}
                    style={{ marginRight: "0.25rem", cursor: "pointer" }}
                  >
                    Detail
                  </button>
                  <button
                    className="sa-btn-xs sa-badge-ok"
                    onClick={() => handleExport(s.storeId)}
                    disabled={exporting}
                    style={{ cursor: exporting ? "not-allowed" : "pointer" }}
                  >
                    GSTR-1
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="sa-text-center sa-text-muted" style={{ padding: "3rem" }}>No GST data for {month}</div>
      )}

      {/* Store detail modal */}
      {selectedStore && (
        <div className="sa-modal-overlay" onClick={() => { setSelectedStore(null); setStoreSummary(null); }} onKeyDown={(e) => { if (e.key === "Escape") { setSelectedStore(null); setStoreSummary(null); } }}>
          <div className="sa-modal-lg" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="sa-flex-between sa-mb-16">
              <h3 className="sa-modal-title" style={{ margin: 0 }}>GST Detail — {month}</h3>
              <button onClick={() => { setSelectedStore(null); setStoreSummary(null); }} className="sa-btn-text" style={{ fontSize: "1.25rem" }} aria-label="Close">&times;</button>
            </div>
            {detailLoading ? (
              <div className="sa-p-24 sa-text-center sa-text-muted">Loading...</div>
            ) : storeSummary ? (
              <div>
                <div className="sa-grid-3 sa-mb-20">
                  {[
                    { label: "CGST", value: formatCurrency(storeSummary.cgstCollected) },
                    { label: "SGST", value: formatCurrency(storeSummary.sgstCollected) },
                    { label: "IGST", value: formatCurrency(storeSummary.igstCollected) },
                    { label: "Input CGST", value: formatCurrency(storeSummary.inputCgst) },
                    { label: "Input SGST", value: formatCurrency(storeSummary.inputSgst) },
                    { label: "Net Payable", value: formatCurrency(storeSummary.netPayable) },
                  ].map((item, i) => (
                    <div key={i} className="sa-stat-card sa-bg-surface-alt sa-p-12">
                      <div className="sa-stat-label">{item.label}</div>
                      <div className="sa-fw-600 sa-mt-4">{item.value}</div>
                    </div>
                  ))}
                </div>

                {storeSummary.stateBreakdown && storeSummary.stateBreakdown.length > 0 && (
                  <>
                    <h4 className="sa-section-subtitle sa-fw-600 sa-mb-8">State-wise Breakdown</h4>
                    <table className="table sa-mb-16">
                      <thead>
                        <tr>
                          <th className="sa-th">State</th>
                          <th className="sa-th sa-th--right">Taxable</th>
                          <th className="sa-th sa-th--right">CGST</th>
                          <th className="sa-th sa-th--right">SGST</th>
                          <th className="sa-th sa-th--right">IGST</th>
                        </tr>
                      </thead>
                      <tbody>
                        {storeSummary.stateBreakdown.map((row, i) => (
                          <tr key={i}>
                            <td className="sa-td">{row.state}</td>
                            <td className="sa-td sa-td--right">{formatCurrency(row.taxableValue)}</td>
                            <td className="sa-td sa-td--right">{formatCurrency(row.cgst)}</td>
                            <td className="sa-td sa-td--right">{formatCurrency(row.sgst)}</td>
                            <td className="sa-td sa-td--right">{formatCurrency(row.igst)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                {storeSummary.supplierBreakdown && storeSummary.supplierBreakdown.length > 0 && (
                  <>
                    <h4 className="sa-section-subtitle sa-fw-600 sa-mb-8">Supplier Breakdown</h4>
                    <table className="table">
                      <thead>
                        <tr>
                          <th className="sa-th">Supplier</th>
                          <th className="sa-th">GSTIN</th>
                          <th className="sa-th sa-th--right">Taxable</th>
                          <th className="sa-th sa-th--right">Tax</th>
                        </tr>
                      </thead>
                      <tbody>
                        {storeSummary.supplierBreakdown.map((row, i) => (
                          <tr key={i}>
                            <td className="sa-td">{row.supplierName}</td>
                            <td className="sa-td sa-td--mono">{row.gstin}</td>
                            <td className="sa-td sa-td--right">{formatCurrency(row.taxableValue)}</td>
                            <td className="sa-td sa-td--right">{formatCurrency(row.totalTax)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            ) : (
              <div className="sa-p-24 sa-text-center sa-text-muted">No data available</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
