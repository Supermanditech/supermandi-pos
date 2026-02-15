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
    } catch (err: any) {
      setError(err.message || "Failed to load GST overview");
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
    } catch (err: any) {
      setError(err.message || "Failed to load store GST detail");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleExport = async (storeId: string) => {
    setExporting(true);
    try {
      const blob = await exportGstr1(storeId, month);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GSTR1_${storeId}_${month}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ padding: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b" }}>GST Compliance Dashboard</h2>
          <p style={{ fontSize: "0.8125rem", color: "#64748b", marginTop: "0.25rem" }}>Monthly GST summary, filing status, and GSTR-1 export</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{ padding: "0.375rem 0.75rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", fontSize: "0.8125rem" }}
          />
          <button onClick={loadOverview} style={{ padding: "0.375rem 0.75rem", fontSize: "0.8125rem", background: "#f1f5f9", border: "1px solid #d1d5db", borderRadius: "0.375rem", cursor: "pointer" }}>
            Refresh
          </button>
        </div>
      </div>

      {error && <div style={{ padding: "0.75rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "0.5rem", color: "#991b1b", marginBottom: "1rem", fontSize: "0.8125rem" }}>{error}</div>}

      {/* Totals summary */}
      {overview && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
          {[
            { label: "Total Sales", value: formatCurrency(overview.totals.totalSales), color: "#3b82f6" },
            { label: "Total GST Collected", value: formatCurrency(overview.totals.totalTax), color: "#10b981" },
            { label: "Total Invoices", value: String(overview.totals.totalInvoices), color: "#8b5cf6" },
            { label: "Filing Deadline", value: overview.filingDeadline, color: "#f59e0b" },
          ].map((card, i) => (
            <div key={i} style={{ padding: "1rem", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "0.75rem", borderLeft: `3px solid ${card.color}` }}>
              <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{card.label}</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", marginTop: "0.25rem" }}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Stores table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#9ca3af" }}>Loading GST data...</div>
      ) : overview && overview.stores.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
              <th style={{ padding: "0.625rem 0.75rem", textAlign: "left", fontWeight: 600, color: "#475569" }}>Store</th>
              <th style={{ padding: "0.625rem 0.75rem", textAlign: "left", fontWeight: 600, color: "#475569" }}>GSTIN</th>
              <th style={{ padding: "0.625rem 0.75rem", textAlign: "right", fontWeight: 600, color: "#475569" }}>Sales</th>
              <th style={{ padding: "0.625rem 0.75rem", textAlign: "right", fontWeight: 600, color: "#475569" }}>Tax</th>
              <th style={{ padding: "0.625rem 0.75rem", textAlign: "right", fontWeight: 600, color: "#475569" }}>Invoices</th>
              <th style={{ padding: "0.625rem 0.75rem", textAlign: "center", fontWeight: 600, color: "#475569" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {overview.stores.map((s) => (
              <tr key={s.storeId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "0.625rem 0.75rem" }}>
                  <div style={{ fontWeight: 500, color: "#1e293b" }}>{s.storeName}</div>
                  <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>{s.storeCode}</div>
                </td>
                <td style={{ padding: "0.625rem 0.75rem", color: s.gstin ? "#475569" : "#d1d5db", fontFamily: "monospace", fontSize: "0.75rem" }}>
                  {s.gstin || "Not registered"}
                </td>
                <td style={{ padding: "0.625rem 0.75rem", textAlign: "right", color: "#1e293b" }}>{formatCurrency(s.totalSales)}</td>
                <td style={{ padding: "0.625rem 0.75rem", textAlign: "right", color: "#1e293b" }}>{formatCurrency(s.totalTax)}</td>
                <td style={{ padding: "0.625rem 0.75rem", textAlign: "right", color: "#475569" }}>{s.invoiceCount}</td>
                <td style={{ padding: "0.625rem 0.75rem", textAlign: "center" }}>
                  <button
                    onClick={() => loadStoreDetail(s.storeId)}
                    style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: "0.25rem", cursor: "pointer", marginRight: "0.25rem" }}
                  >
                    Detail
                  </button>
                  <button
                    onClick={() => handleExport(s.storeId)}
                    disabled={exporting}
                    style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: "0.25rem", cursor: exporting ? "not-allowed" : "pointer" }}
                  >
                    GSTR-1
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ textAlign: "center", padding: "3rem", color: "#9ca3af" }}>No GST data for {month}</div>
      )}

      {/* Store detail modal */}
      {selectedStore && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }} onClick={() => { setSelectedStore(null); setStoreSummary(null); }}>
          <div style={{ background: "#fff", borderRadius: "0.75rem", padding: "1.5rem", maxWidth: "700px", width: "90%", maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "1.125rem", fontWeight: 700, color: "#1e293b" }}>GST Detail — {month}</h3>
              <button onClick={() => { setSelectedStore(null); setStoreSummary(null); }} style={{ background: "none", border: "none", fontSize: "1.25rem", cursor: "pointer", color: "#94a3b8" }}>&times;</button>
            </div>
            {detailLoading ? (
              <div style={{ textAlign: "center", padding: "2rem", color: "#9ca3af" }}>Loading...</div>
            ) : storeSummary ? (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", marginBottom: "1.25rem" }}>
                  {[
                    { label: "CGST", value: formatCurrency(storeSummary.cgstCollected) },
                    { label: "SGST", value: formatCurrency(storeSummary.sgstCollected) },
                    { label: "IGST", value: formatCurrency(storeSummary.igstCollected) },
                    { label: "Input CGST", value: formatCurrency(storeSummary.inputCgst) },
                    { label: "Input SGST", value: formatCurrency(storeSummary.inputSgst) },
                    { label: "Net Payable", value: formatCurrency(storeSummary.netPayable) },
                  ].map((item, i) => (
                    <div key={i} style={{ padding: "0.75rem", background: "#f8fafc", borderRadius: "0.5rem", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: "0.6875rem", color: "#64748b", textTransform: "uppercase" }}>{item.label}</div>
                      <div style={{ fontSize: "1rem", fontWeight: 600, color: "#1e293b", marginTop: "0.125rem" }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                {storeSummary.stateBreakdown && storeSummary.stateBreakdown.length > 0 && (
                  <>
                    <h4 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#475569", marginBottom: "0.5rem" }}>State-wise Breakdown</h4>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem", marginBottom: "1rem" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          <th style={{ padding: "0.375rem", textAlign: "left" }}>State</th>
                          <th style={{ padding: "0.375rem", textAlign: "right" }}>Taxable</th>
                          <th style={{ padding: "0.375rem", textAlign: "right" }}>CGST</th>
                          <th style={{ padding: "0.375rem", textAlign: "right" }}>SGST</th>
                          <th style={{ padding: "0.375rem", textAlign: "right" }}>IGST</th>
                        </tr>
                      </thead>
                      <tbody>
                        {storeSummary.stateBreakdown.map((row, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "0.375rem" }}>{row.state}</td>
                            <td style={{ padding: "0.375rem", textAlign: "right" }}>{formatCurrency(row.taxableValue)}</td>
                            <td style={{ padding: "0.375rem", textAlign: "right" }}>{formatCurrency(row.cgst)}</td>
                            <td style={{ padding: "0.375rem", textAlign: "right" }}>{formatCurrency(row.sgst)}</td>
                            <td style={{ padding: "0.375rem", textAlign: "right" }}>{formatCurrency(row.igst)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                {storeSummary.supplierBreakdown && storeSummary.supplierBreakdown.length > 0 && (
                  <>
                    <h4 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#475569", marginBottom: "0.5rem" }}>Supplier Breakdown</h4>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          <th style={{ padding: "0.375rem", textAlign: "left" }}>Supplier</th>
                          <th style={{ padding: "0.375rem", textAlign: "left" }}>GSTIN</th>
                          <th style={{ padding: "0.375rem", textAlign: "right" }}>Taxable</th>
                          <th style={{ padding: "0.375rem", textAlign: "right" }}>Tax</th>
                        </tr>
                      </thead>
                      <tbody>
                        {storeSummary.supplierBreakdown.map((row, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "0.375rem" }}>{row.supplierName}</td>
                            <td style={{ padding: "0.375rem", fontFamily: "monospace", fontSize: "0.6875rem" }}>{row.gstin}</td>
                            <td style={{ padding: "0.375rem", textAlign: "right" }}>{formatCurrency(row.taxableValue)}</td>
                            <td style={{ padding: "0.375rem", textAlign: "right" }}>{formatCurrency(row.totalTax)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "2rem", color: "#9ca3af" }}>No data available</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
